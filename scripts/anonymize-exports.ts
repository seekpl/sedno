/**
 * Anonimizacja prawdziwych eksportów (docs/decisions.md p. 19). Czyta tests/fixtures/private/*.csv
 * (katalog w .gitignore, nigdy w repozytorium), dekoduje je jak parser, znajduje nagłówek tak jak parser
 * i zostawia wyłącznie kolumny z liczbami, datą i typem publikacji. Usuwa opisy, permalinki,
 * identyfikatory, nazwy kont, adresy, kolumny nieznane i wiersze opisu nad nagłówkiem. W zachowanych
 * kolumnach zostają tylko wartości o kształcie pola (data, liczba, krótka nazwa typu) — tekst, który
 * trafiłby tam z przesuniętego wiersza, jest czyszczony. Zachowuje oryginalne nagłówki i separator.
 * Wynik: tests/fixtures/real-<opis-pliku>.csv w UTF-8.
 *
 * Nazwa wyniku opisuje format (język nagłówków, separator, kodowanie, miesiące), a nie nazwę pliku
 * źródłowego — ta mogłaby zawierać nazwę klienta albo identyfikator konta.
 *
 * Warunek publicznego startu: każdy prawdziwy plik parsuje się bez mapowania ręcznego. Skrypt kończy się
 * kodem 1, gdy któryś plik tego nie spełnia — także wtedy, gdy nie da się go zanonimizować (wtedy nie
 * powstaje real-*.csv i test tests/unit/csv-real.test.ts by go nie zobaczył).
 *
 * Użycie: pnpm exec tsx scripts/anonymize-exports.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { matchHeader, normalizeHeader } from '../lib/csv/columns';
import { decodeBytes } from '../lib/csv/decode';
import { detectDelimiter, locateHeaderRow, parseExport, tokenize, type Delimiter } from '../lib/csv/parse';
import type { FieldKey } from '../lib/csv/types';
import { parseDate, parseNumber } from '../lib/csv/values';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PRIVATE_DIR = path.join(ROOT, 'tests/fixtures/private');
export const OUT_DIR = path.join(ROOT, 'tests/fixtures');

/** Kolumny, które zostają. Bez opisu i permalinku (a wszystko nierozpoznane odpada). */
export const KEPT_FIELDS: readonly FieldKey[] = [
  'publishedAt',
  'views',
  'reach',
  'likes',
  'comments',
  'shares',
  'saves',
  'follows',
  'type',
];

const DELIMITER_NAMES: Record<Delimiter, string> = { ',': 'comma', ';': 'semicolon', '\t': 'tab' };

/** Synonimy angielskie — do opisu języka nagłówków w nazwie pliku. */
const ENGLISH = new Set([
  'publish time',
  'publish date',
  'date',
  'views',
  'reach',
  'accounts reached',
  'likes',
  'reactions',
  'comments',
  'shares',
  'saves',
  'follows',
  'post type',
  'content type',
  'type',
]);

/** Komórki „brak danych” w kolumnach liczbowych (jak w parseNumber). */
const NO_DATA_CELL = /^(?:-|–|—|−|n\/a|na|brak|brak danych)$/i;
/** Słowo zamiast daty, np. „Lifetime”, „Łącznie” (kolumna „Date/Data” w eksporcie): 1–3 słowa z liter. */
const DATE_WORD = /^\p{L}+(?: \p{L}+){0,2}$/u;
/** Nazwa typu publikacji, np. „IG reel”, „Rolka na Instagramie”: litery, cyfry, spacje i prosta interpunkcja. */
const TYPE_NAME = /^[\p{L}\p{N} ()&+.,_-]+$/u;

/**
 * Wartość zachowanej kolumny, jeśli ma kształt pola; w przeciwnym razie pusta komórka. Chroni przed tekstem
 * z opisów albo stopek, który w uszkodzonym wierszu trafiłby do kolumny daty, liczby lub typu.
 */
export function safeCell(field: FieldKey, raw: string): string {
  const v = raw.trim();
  if (v === '') return '';
  if (field === 'publishedAt') {
    const isDate = parseDate(v, 'mdy') !== null || parseDate(v, 'dmy') !== null;
    return isDate || (v.length <= 25 && DATE_WORD.test(v)) ? v : '';
  }
  if (field === 'type') {
    return v.length <= 40 && v.split(' ').length <= 5 && TYPE_NAME.test(v) ? v : '';
  }
  return parseNumber(v) !== null || NO_DATA_CELL.test(v) ? v : '';
}

export type AnonymizeResult =
  | {
      ok: true;
      /** Zanonimizowany CSV (bez BOM; BOM dokłada zapis, gdy był w oryginale). */
      csv: string;
      bom: boolean;
      /** Opis formatu do nazwy pliku (kodowanie oryginału), np. „pl-semicolon-utf-8-bom-2026-08-2026-09”. */
      slug: string;
      /** Nagłówki, które zostały. */
      kept: string[];
      /** Liczba usuniętych kolumn. */
      dropped: number;
      /** Liczba wyczyszczonych komórek (wartość bez kształtu pola). */
      cleared: number;
      rows: number;
    }
  | { ok: false; reason: string };

export function anonymizeExport(input: Uint8Array): AnonymizeResult {
  const decoded = decodeBytes(input);
  if (!decoded.ok) return { ok: false, reason: decoded.error.code };

  const delimiter = detectDelimiter(decoded.text);
  const rows = tokenize(decoded.text, delimiter);
  if (rows.length === 0) return { ok: false, reason: 'E_EMPTY' };

  // Ten sam wybór nagłówka co w parseExport (także plik z dwiema znanymi kolumnami).
  const headerIndex = locateHeaderRow(rows);
  const header = rows[headerIndex] ?? [];
  const keep = header
    .map((cell, index) => ({ cell: cell.trim(), index, field: matchHeader(cell)?.field }))
    .filter((c): c is { cell: string; index: number; field: FieldKey } =>
      c.field !== undefined ? KEPT_FIELDS.includes(c.field) : false,
    );
  if (keep.length === 0) return { ok: false, reason: 'brak rozpoznanych kolumn daty, liczb ani typu' };

  let cleared = 0;
  const data = rows.slice(headerIndex + 1).map((row) =>
    keep.map((c) => {
      const raw = (row[c.index] ?? '').trim();
      const safe = safeCell(c.field, raw);
      if (safe !== raw) cleared++;
      return safe;
    }),
  );
  const csv = Papa.unparse({ fields: keep.map((c) => c.cell), data }, { delimiter, newline: '\n' }) + '\n';

  const english = keep.filter((c) => ENGLISH.has(normalizeHeader(c.cell))).length;
  const lang = english * 2 > keep.length ? 'en' : 'pl';
  const encoding = `${decoded.encoding}${decoded.bom ? '-bom' : ''}`;
  const parsed = parseExport({
    bytes: new TextEncoder().encode(csv).buffer,
    fileName: 'real.csv',
    mimeType: '',
  });
  // Zakres miesięcy: „2026-09” albo „2026-08-2026-09”.
  const months = parsed.ok
    ? [...new Set([parsed.data.months[0], parsed.data.months[parsed.data.months.length - 1]])].join('-')
    : 'bez-dat';
  const slug = `${lang}-${DELIMITER_NAMES[delimiter]}-${encoding}-${months}`.toLowerCase();

  return {
    ok: true,
    csv,
    bom: decoded.bom,
    slug,
    kept: keep.map((c) => c.cell),
    dropped: header.filter((cell) => cell.trim() !== '').length - keep.length,
    cleared,
    rows: data.length,
  };
}

export type DirectoryReport = {
  /** Zapisane pliki real-*.csv i wynik parsera bez mapowania ręcznego. */
  written: { source: string; out: string; pass: boolean }[];
  /** Pliki, których nie dało się zanonimizować (nie spełniają warunku startu). */
  failed: { source: string; reason: string }[];
  /** true, gdy każdy plik parsuje się bez mapowania ręcznego (warunek startu). */
  allPass: boolean;
};

/** Anonimizuje każdy *.csv z `privateDir` do `outDir`. Nie rzuca, gdy katalogu nie ma. */
export function anonymizeDirectory(
  privateDir: string,
  outDir: string,
  log: (line: string) => void = () => {},
): DirectoryReport {
  const report: DirectoryReport = { written: [], failed: [], allPass: true };
  if (!fs.existsSync(privateDir)) {
    log('Brak katalogu tests/fixtures/private/ — nie ma czego anonimizować.');
    return report;
  }
  const files = fs
    .readdirSync(privateDir)
    .filter((name) => /\.csv$/i.test(name))
    .sort();
  if (files.length === 0) {
    log('Brak plików .csv w tests/fixtures/private/.');
    return report;
  }

  const used = new Set<string>();
  for (const name of files) {
    const result = anonymizeExport(new Uint8Array(fs.readFileSync(path.join(privateDir, name))));
    if (!result.ok) {
      report.failed.push({ source: name, reason: result.reason });
      report.allPass = false;
      log(`${name}: NIE SPEŁNIA warunku startu — nie da się zanonimizować (${result.reason})`);
      continue;
    }
    let slug = result.slug;
    for (let n = 2; used.has(slug); n++) slug = `${result.slug}-${n}`;
    used.add(slug);

    const outName = `real-${slug}.csv`;
    const body = Buffer.from(result.csv, 'utf8');
    const bytes = result.bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]) : body;
    fs.writeFileSync(path.join(outDir, outName), bytes);

    const check = parseExport({
      bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      fileName: outName,
      mimeType: 'text/csv',
    });
    report.written.push({ source: name, out: outName, pass: check.ok });
    if (!check.ok) report.allPass = false;
    const status = check.ok
      ? 'parser bez mapowania: OK'
      : `parser bez mapowania: ${check.error.code} — NIE SPEŁNIA warunku startu`;
    log(
      `${name} → tests/fixtures/${outName}: ${result.rows} wierszy, kolumny: ${result.kept.join(' | ')}; ` +
        `usunięto ${result.dropped}, wyczyszczono komórek: ${result.cleared}; ${status}`,
    );
  }
  return report;
}

function main() {
  const report = anonymizeDirectory(PRIVATE_DIR, OUT_DIR, (line) => console.log(line));
  const total = report.written.length + report.failed.length;
  if (total === 0) return;
  const passing = report.written.filter((w) => w.pass).length;
  console.log(`Warunek startu: ${passing} z ${total} plików parsuje się bez mapowania ręcznego.`);
  if (!report.allPass) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();

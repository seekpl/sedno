/**
 * Parser eksportu treści z Meta Business Suite (PROMPT.md §6). Czysta, synchroniczna funkcja: działa
 * w Web Workerze, w wątku głównym i w Node (testy). Plik nigdy nie opuszcza przeglądarki (zasada 1),
 * a wynik nie zawiera opisów postów ani żadnego tekstu z pliku poza oczyszczonym permalinkiem.
 */
import Papa from 'papaparse';
import { FIELD_KEYS, isFieldKey, matchHeader, normalizeHeader } from './columns';
import { checkFileMeta, decodeBytes } from './decode';
import {
  LIMITS,
  type ColumnMapping,
  type FieldKey,
  type ParseInput,
  type ParseResult,
  type PostRow,
  type RequiredField,
  type Warning,
} from './types';
import {
  detectDateOrder,
  normalizeType,
  parseDate,
  parseNumber,
  sanitizePermalink,
  warsawMonthKeyFast,
} from './values';

export type Delimiter = ',' | ';' | '\t';
export const DELIMITERS: readonly Delimiter[] = [',', ';', '\t'];

/** Ile pierwszych niepustych wierszy bierzemy pod uwagę przy wykrywaniu separatora i nagłówka. */
const SAMPLE_ROWS = 20;
/** Ile wierszy od początku przeszukujemy w poszukiwaniu nagłówka (opis eksportu bywa nad nim). */
const HEADER_SCAN_ROWS = 50;
/** Minimalna liczba znanych pól w wierszu nagłówka. */
const HEADER_MIN_KNOWN = 3;
/** Co ile wierszy raportujemy postęp. */
const PROGRESS_EVERY = 500;

/** Podział tekstu na wiersze i komórki (PapaParse, z obsługą cudzysłowów i nowych linii w komórkach). */
export function tokenize(text: string, delimiter: Delimiter, preview = 0): string[][] {
  const result = Papa.parse<string[]>(text, {
    delimiter,
    quoteChar: '"',
    skipEmptyLines: 'greedy',
    preview,
  });
  return result.data;
}

/** Liczba różnych znanych pól w wierszu (synonimy albo mapowanie ręczne). */
function knownFieldCount(row: readonly string[], mapping: MappingLookup): number {
  const fields = new Set<FieldKey>();
  for (const cell of row) {
    const field = mapping.get(cell) ?? matchHeader(cell)?.field;
    if (field) fields.add(field);
  }
  return fields.size;
}

/**
 * Separator: ',', ';' albo tabulator. Dla każdego kandydata dzielimy pierwsze ~20 niepustych wierszy
 * (z obsługą cudzysłowów) i liczymy, ile z nich ma tę samą, najczęstszą liczbę pól (> 1). Pierwszeństwo
 * ma separator, przy którym znajdujemy wiersz nagłówka (≥ 3 znane pola) — to silniejszy sygnał niż
 * sama spójność, bo opis eksportu nad nagłówkiem ma zwykle inną liczbę pól.
 */
export function detectDelimiter(text: string, mapping: ColumnMapping = {}): Delimiter {
  const lookup = mappingLookup(mapping);
  let best: { delimiter: Delimiter; header: number; consistency: number; width: number } | null = null;
  for (const delimiter of DELIMITERS) {
    const rows = tokenize(text, delimiter, HEADER_SCAN_ROWS);
    const sample = rows.slice(0, SAMPLE_ROWS);
    const counts = new Map<number, number>();
    for (const row of sample) {
      if (row.length > 1) counts.set(row.length, (counts.get(row.length) ?? 0) + 1);
    }
    let width = 0;
    let consistency = 0;
    for (const [fields, n] of counts) {
      if (n > consistency || (n === consistency && fields > width)) {
        consistency = n;
        width = fields;
      }
    }
    const header = rows.some((row) => knownFieldCount(row, lookup) >= HEADER_MIN_KNOWN) ? 1 : 0;
    const candidate = { delimiter, header, consistency, width };
    if (
      !best ||
      candidate.header > best.header ||
      (candidate.header === best.header && candidate.consistency > best.consistency) ||
      (candidate.header === best.header &&
        candidate.consistency === best.consistency &&
        candidate.width > best.width)
    ) {
      best = candidate;
    }
  }
  return best && best.consistency > 0 ? best.delimiter : ',';
}

type MappingLookup = { get(header: string): FieldKey | undefined; size: number };

/** Mapowanie ręczne: dopasowanie po przyciętym tekście nagłówka, a w drugiej kolejności po normalizacji. */
function mappingLookup(mapping: ColumnMapping): MappingLookup {
  const exact = new Map<string, FieldKey>();
  const normalized = new Map<string, FieldKey>();
  for (const [header, field] of Object.entries(mapping)) {
    if (!isFieldKey(field)) continue;
    const key = header.trim();
    if (key === '') continue;
    if (!exact.has(key)) exact.set(key, field);
    const norm = normalizeHeader(key);
    if (norm !== '' && !normalized.has(norm)) normalized.set(norm, field);
  }
  return {
    size: exact.size,
    get(header: string) {
      const key = header.trim();
      return exact.get(key) ?? normalized.get(normalizeHeader(key));
    },
  };
}

/**
 * Wiersz nagłówka: pierwszy wiersz z ≥ 3 znanymi polami; przy mapowaniu ręcznym także pierwszy wiersz
 * z nagłówkiem wskazanym w mapowaniu. Zwraca indeks albo -1.
 */
export function findHeaderRow(rows: readonly (readonly string[])[], mapping: ColumnMapping = {}): number {
  const lookup = mappingLookup(mapping);
  const limit = Math.min(rows.length, HEADER_SCAN_ROWS);
  for (let i = 0; i < limit; i++) {
    if (knownFieldCount(rows[i]!, lookup) >= HEADER_MIN_KNOWN) return i;
  }
  if (lookup.size > 0) {
    for (let i = 0; i < limit; i++) {
      if (rows[i]!.some((cell) => lookup.get(cell) !== undefined)) return i;
    }
  }
  return -1;
}

/**
 * Gdy nagłówka nie rozpoznaliśmy: wiersz, który najpewniej nim jest — pierwszy o najczęstszej liczbie pól
 * (> 1) wśród pierwszych ~20 wierszy (pomija opis eksportu nad tabelą); w ostateczności pierwszy wiersz.
 */
function guessHeaderRow(rows: readonly (readonly string[])[]): number {
  const sample = rows.slice(0, SAMPLE_ROWS);
  const counts = new Map<number, number>();
  for (const row of sample) if (row.length > 1) counts.set(row.length, (counts.get(row.length) ?? 0) + 1);
  let width = 0;
  let best = 0;
  for (const [fields, n] of counts) {
    if (n > best || (n === best && fields > width)) {
      best = n;
      width = fields;
    }
  }
  const index = sample.findIndex((row) => row.length === width);
  return index >= 0 ? index : 0;
}

/**
 * Wiersz nagłówka tak, jak go wybiera parseExport: rozpoznany (findHeaderRow), a gdy go nie ma — zgadnięty.
 * Ten sam wybór stosuje skrypt anonimizacji, żeby sprawdzał prawdziwe pliki tak jak parser.
 */
export function locateHeaderRow(rows: readonly (readonly string[])[], mapping: ColumnMapping = {}): number {
  const found = findHeaderRow(rows, mapping);
  return found >= 0 ? found : guessHeaderRow(rows);
}

/** Oryginalne nagłówki (przycięte, niepuste) — do ekranu „Przypisz kolumny”. */
function headerCells(row: readonly string[]): string[] {
  return row.map((cell) => cell.replace(/^\uFEFF/, '').trim()).filter((cell) => cell !== '');
}

/**
 * Kolumna dla każdego pola. Mapowanie ręczne ma pierwszeństwo przed synonimami; gdy kilka kolumn pasuje
 * do tego samego pola, wygrywa synonim wcześniej na liście, a przy remisie kolumna bardziej z lewej.
 */
export function resolveColumns(
  header: readonly string[],
  mapping: ColumnMapping = {},
): Partial<Record<FieldKey, number>> {
  const lookup = mappingLookup(mapping);
  const columns: Partial<Record<FieldKey, number>> = {};
  const ranks: Partial<Record<FieldKey, number>> = {};
  const mappedFields = new Set<FieldKey>();

  header.forEach((cell, index) => {
    const mapped = lookup.get(cell);
    if (mapped === undefined || mappedFields.has(mapped)) return;
    mappedFields.add(mapped);
    columns[mapped] = index;
  });

  header.forEach((cell, index) => {
    if (lookup.get(cell) !== undefined) return;
    const match = matchHeader(cell);
    if (!match || mappedFields.has(match.field)) return;
    const rank = ranks[match.field];
    if (rank === undefined || match.rank < rank) {
      ranks[match.field] = match.rank;
      columns[match.field] = index;
    }
  });

  return columns;
}

/** Brakujące pola wymagane: data i wyświetlenia (albo zasięg). */
function missingRequired(columns: Partial<Record<FieldKey, number>>): RequiredField[] {
  const missing: RequiredField[] = [];
  if (columns.publishedAt === undefined) missing.push('publishedAt');
  if (columns.views === undefined && columns.reach === undefined) missing.push('views');
  return missing;
}

/**
 * Czy poza wybraną kolumną daty jest kolumna, w której większość niepustych komórek to daty? Sprawdzamy
 * tylko wartości pod kątem kształtu daty i niczego nie zachowujemy; kolumn opisu i permalinku nie czytamy.
 */
function otherDateColumn(
  records: readonly (readonly string[])[],
  columns: Partial<Record<FieldKey, number>>,
  dateColumn: number,
): boolean {
  const skip = new Set([dateColumn, columns.description, columns.permalink]);
  const width = Math.max(0, ...records.slice(0, SAMPLE_ROWS * 10).map((record) => record.length));
  for (let index = 0; index < width; index++) {
    if (skip.has(index)) continue;
    const cells = records.map((record) => (record[index] ?? '').trim()).filter((cell) => cell !== '');
    if (cells.length === 0) continue;
    const order = detectDateOrder(cells);
    const dates = cells.filter((cell) => parseDate(cell, order) !== null).length;
    if (dates * 2 > cells.length) return true;
  }
  return false;
}

/** Licznik z komórki: liczba całkowita ≥ 0 albo null. Ułamki (np. po Excelu) zaokrąglamy. */
function count(cell: string | undefined): number | null {
  const n = parseNumber(cell);
  return n === null ? null : Math.round(n);
}

export type ParseOptions = {
  /** Mapowanie ręczne: oryginalny nagłówek → pole. Ma pierwszeństwo przed rozpoznaniem automatycznym. */
  mapping?: ColumnMapping;
  /** Postęp: co ~500 wierszy i raz na końcu. */
  onProgress?: (done: number, total: number) => void;
};

/** Wczytuje eksport. Nigdy nie rzuca dla złego pliku — zwraca kod błędu. */
export function parseExport(input: ParseInput, options: ParseOptions = {}): ParseResult {
  const mapping = options.mapping ?? {};
  const metaError = checkFileMeta({
    fileName: input.fileName,
    mimeType: input.mimeType,
    size: input.bytes.byteLength,
  });
  if (metaError) return { ok: false, error: metaError };
  if (input.bytes.byteLength === 0) return { ok: false, error: { code: 'E_EMPTY' } };

  const decoded = decodeBytes(input.bytes);
  if (!decoded.ok) return { ok: false, error: decoded.error };
  // Same separatory, cudzysłowy i białe znaki (np. „;;;” po wyczyszczeniu arkusza) to też pusty plik.
  if (!/[^\s,;"]/.test(decoded.text)) return { ok: false, error: { code: 'E_EMPTY' } };

  const delimiter = detectDelimiter(decoded.text, mapping);
  const rows = tokenize(decoded.text, delimiter);
  if (rows.length === 0) return { ok: false, error: { code: 'E_EMPTY' } };

  const headerIndex = locateHeaderRow(rows, mapping);
  const header = rows[headerIndex] ?? [];
  const records = rows.slice(headerIndex + 1);

  if (records.length > LIMITS.maxRows) return { ok: false, error: { code: 'E_TOO_BIG', reason: 'rows' } };

  // Bez rozpoznanego nagłówka sprawdzamy wiersz zgadnięty — plik z samą datą i wyświetleniami
  // (dwie znane kolumny) też jest poprawny. Gdy brakuje pól, ekran „Przypisz kolumny” dostaje nagłówki.
  const columns = resolveColumns(header, mapping);
  const missing = missingRequired(columns);
  if (missing.length > 0) {
    return { ok: false, error: { code: 'E_MISSING_COLUMNS', missing, headers: headerCells(header) } };
  }

  const dateColumn = columns.publishedAt!;
  const order = detectDateOrder(records.map((record) => record[dateColumn] ?? ''));
  const cell = (record: readonly string[], field: FieldKey): string | undefined => {
    const index = columns[field];
    return index === undefined ? undefined : record[index];
  };

  const total = records.length;
  const out: PostRow[] = [];
  for (let i = 0; i < total; i++) {
    const record = records[i]!;
    const publishedAt = parseDate(cell(record, 'publishedAt'), order);
    if (publishedAt) {
      // Budujemy wiersz wyłącznie z pól liczbowych, daty, typu i oczyszczonego permalinku.
      // Kolumny opisu ani żadnej innej nie czytamy.
      const row: PostRow = {
        publishedAt,
        type: normalizeType(cell(record, 'type')),
        views: count(cell(record, 'views')),
        reach: count(cell(record, 'reach')),
        likes: count(cell(record, 'likes')),
        comments: count(cell(record, 'comments')),
        shares: count(cell(record, 'shares')),
        saves: count(cell(record, 'saves')),
        follows: count(cell(record, 'follows')),
      };
      const permalink = sanitizePermalink(cell(record, 'permalink'));
      if (permalink) row.permalink = permalink;
      out.push(row);
    }
    if ((i + 1) % PROGRESS_EVERY === 0 && i + 1 < total) options.onProgress?.(i + 1, total);
  }
  options.onProgress?.(total, total);

  if (out.length === 0) {
    // Kolumna daty bez ani jednej daty (np. „Date/Data” z wartością „Lifetime/Łącznie”, gdy kolumna
    // czasu publikacji ma nieznaną nazwę), a daty są w innej kolumnie: to zła kolumna, nie pusty plik.
    // Pokazujemy ekran „Przypisz kolumny” (decyzja 19), zamiast mówić, że plik jest pusty.
    if (otherDateColumn(records, columns, dateColumn)) {
      return {
        ok: false,
        error: { code: 'E_MISSING_COLUMNS', missing: ['publishedAt'], headers: headerCells(header) },
      };
    }
    return { ok: false, error: { code: 'E_EMPTY' } };
  }

  let from = out[0]!.publishedAt;
  let to = from;
  const months = new Set<string>();
  for (const row of out) {
    if (row.publishedAt < from) from = row.publishedAt;
    if (row.publishedAt > to) to = row.publishedAt;
    months.add(warsawMonthKeyFast(row.publishedAt));
  }

  const warnings: Warning[] = decoded.guessed ? [{ code: 'W_ENCODING_GUESSED' }] : [];
  const fields = FIELD_KEYS.filter((field) => field !== 'description' && columns[field] !== undefined);

  return {
    ok: true,
    data: {
      rows: out,
      range: { from, to },
      months: [...months].sort(),
      warnings,
      fields,
    },
  };
}

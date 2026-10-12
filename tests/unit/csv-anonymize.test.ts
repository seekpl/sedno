import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseExport } from '@/lib/csv/parse';
import { anonymizeDirectory, anonymizeExport, safeCell } from '@/scripts/anonymize-exports';
import { DESCRIPTIONS, FIXTURES_DIR, MAIN_TOTALS, PRIVACY_CANARY } from '@/scripts/make-fixtures';

function fixture(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, name)));
}

function reparse(csv: string) {
  return parseExport({
    bytes: new TextEncoder().encode(csv).buffer,
    fileName: 'real.csv',
    mimeType: 'text/csv',
  });
}

describe('anonymizeExport (scripts/anonymize-exports.ts)', () => {
  it('zostawia tylko datę, liczby i typ; zachowuje nagłówki i separator', () => {
    const result = anonymizeExport(fixture('synthetic-privacy-canary.csv'));
    if (!result.ok) throw new Error(result.reason);
    expect(result.kept).toEqual([
      'Czas publikacji',
      'Typ posta',
      'Data',
      'Wyświetlenia',
      'Zasięg',
      'Polubienia',
      'Udostępnienia',
      'Obserwacje',
      'Komentarze',
      'Zapisania',
    ]);
    expect(result.dropped).toBe(9);
    expect(result.csv.split('\n')[0]).toBe(result.kept.join(';'));
    expect(result.bom).toBe(true);
    expect(result.slug).toBe('pl-semicolon-utf-8-bom-2026-08-2026-09');
    expect(result.rows).toBe(59);
  });

  it('usuwa opisy, permalinki, identyfikatory i nazwy kont', () => {
    const result = anonymizeExport(fixture('synthetic-privacy-canary.csv'));
    if (!result.ok) throw new Error(result.reason);
    expect(result.csv).not.toContain(PRIVACY_CANARY);
    expect(result.csv).not.toMatch(/instagram\.com|https?:|sedno_canary|900000000000002|syntetyczny-/);
    for (const description of DESCRIPTIONS) expect(result.csv).not.toContain(description.slice(0, 20));
  });

  it('wynik parsuje się bez mapowania i daje te same liczby', () => {
    const result = anonymizeExport(fixture('synthetic-pl-semicolon-bom.csv'));
    if (!result.ok) throw new Error(result.reason);
    const parsed = reparse(result.csv);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
    const sep = parsed.data.rows.filter((r) => r.publishedAt >= new Date('2026-08-31T22:00:00Z'));
    expect(sep).toHaveLength(MAIN_TOTALS['2026-09'].posts);
    expect(sep.reduce((a, r) => a + (r.views ?? 0), 0)).toBe(MAIN_TOTALS['2026-09'].views);
    expect(parsed.data.fields).not.toContain('permalink');
  });

  it('pomija wiersze opisu nad nagłówkiem i zapisuje UTF-8 (także z windows-1250)', () => {
    const preamble = anonymizeExport(fixture('synthetic-preamble.csv'));
    if (!preamble.ok) throw new Error(preamble.reason);
    expect(preamble.csv.startsWith('Czas publikacji,Typ posta,Wyświetlenia')).toBe(true);
    expect(preamble.csv).not.toContain('Eksport treści');
    expect(preamble.slug).toBe('pl-comma-utf-8-2026-09');

    const cp1250 = anonymizeExport(fixture('synthetic-windows-1250.csv'));
    if (!cp1250.ok) throw new Error(cp1250.reason);
    expect(cp1250.csv).toContain('Wyświetlenia');
    expect(cp1250.slug).toBe('pl-semicolon-windows-1250-2026-09');
    expect(reparse(cp1250.csv).ok).toBe(true);
  });

  it('angielski eksport z przecinkiem: liczby „1,234” zostają w cudzysłowach', () => {
    const result = anonymizeExport(fixture('synthetic-en-comma.csv'));
    if (!result.ok) throw new Error(result.reason);
    expect(result.slug).toBe('en-comma-utf-8-2026-09');
    expect(result.csv).toMatch(/"\d,\d{3}"/);
    const parsed = reparse(result.csv);
    expect(parsed.ok && parsed.data.rows.reduce((a, r) => a + (r.views ?? 0), 0)).toBe(45678);
  });

  it('pliki bez rozpoznawalnego nagłówka i pliki błędne są pomijane', () => {
    expect(anonymizeExport(fixture('synthetic-unknown-headers.csv'))).toMatchObject({ ok: false });
    expect(anonymizeExport(fixture('synthetic-empty.csv'))).toEqual({ ok: false, reason: 'E_EMPTY' });
    expect(anonymizeExport(fixture('synthetic-binary.csv'))).toEqual({ ok: false, reason: 'E_NOT_CSV' });
  });
});

describe('safeCell: w zachowanych kolumnach tylko wartości o kształcie pola', () => {
  it.each([
    ['publishedAt', '09/01/2026 10:15', '09/01/2026 10:15'],
    ['publishedAt', '13.09.2026 10:15', '13.09.2026 10:15'],
    ['publishedAt', '2026-09-01T10:15:00+02:00', '2026-09-01T10:15:00+02:00'],
    ['publishedAt', 'Lifetime', 'Lifetime'],
    ['publishedAt', 'Łącznie', 'Łącznie'],
    ['publishedAt', 'Zapisy przez link w profilu, zapraszamy 12.09', ''],
    ['publishedAt', 'https://www.instagram.com/p/x/', ''],
    ['views', '12 480', '12 480'],
    ['views', '"1,234"', ''],
    ['views', '1,234', '1,234'],
    ['views', 'N/A', 'N/A'],
    ['views', '—', '—'],
    ['views', 'Nowy cennik', ''],
    ['likes', '-5', ''],
    ['type', 'IG reel', 'IG reel'],
    ['type', 'Rolka na Instagramie', 'Rolka na Instagramie'],
    ['type', 'Metamorfoza brwi krok po kroku. Zapisy przez link w profilu.', ''],
    ['type', 'kontakt@studio.example', ''],
    ['type', '', ''],
  ] as const)('%s: %j → %j', (field, raw, expected) => {
    expect(safeCell(field, raw)).toBe(expected);
  });

  it('tekst z uszkodzonego wiersza nie trafia do wyniku', () => {
    const text = [
      'Identyfikator posta;Czas publikacji;Opis;Wyświetlenia;Zasięg;Typ posta',
      '1;09/01/2026 10:00;Opis pierwszy;100;80;IG reel',
      // Wiersz przesunięty o jedną kolumnę: opis w kolumnach daty, liczb i typu.
      '2;Tajny opis klienta, zapraszamy;Druga część tajnego opisu;Trzecia część;Czwarta;Tajne konto klienta i dużo innego tekstu',
      'Wygenerowano dla: Tajny Klient Sp. z o.o.',
    ].join('\n');
    const result = anonymizeExport(new TextEncoder().encode(text));
    if (!result.ok) throw new Error(result.reason);
    expect(result.csv).not.toMatch(/Tajn|Wygenerowano|Klient/);
    expect(result.cleared).toBe(4);
    expect(reparse(result.csv)).toMatchObject({ ok: true, data: { rows: [{ views: 100, reach: 80 }] } });
  });
});

describe('anonymizeExport: nagłówek wybierany jak w parserze', () => {
  it('plik z dwiema znanymi kolumnami (parser go przyjmuje) też jest anonimizowany', () => {
    const text = 'Czas publikacji,Notatka,Wyświetlenia\n2026-09-01 10:00,Tajna notatka,100\n';
    expect(
      parseExport({ bytes: new TextEncoder().encode(text).buffer, fileName: 'a.csv', mimeType: '' }).ok,
    ).toBe(true);
    const result = anonymizeExport(new TextEncoder().encode(text));
    if (!result.ok) throw new Error(result.reason);
    expect(result.kept).toEqual(['Czas publikacji', 'Wyświetlenia']);
    expect(result.csv).not.toContain('Tajna');
  });
});

describe('anonymizeDirectory (warunek startu, decyzja 19)', () => {
  const dirs: string[] = [];
  const tmp = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sedno-anon-'));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('brak katalogu z prawdziwymi plikami: nic nie robi, warunek nie jest naruszony', () => {
    const out = tmp();
    const report = anonymizeDirectory(path.join(out, 'nie-ma'), out);
    expect(report).toEqual({ written: [], failed: [], allPass: true });
    expect(fs.readdirSync(out)).toEqual([]);
  });

  it('plik, którego nie da się zanonimizować albo sparsować bez mapowania, łamie warunek startu', () => {
    const priv = tmp();
    const out = tmp();
    fs.copyFileSync(
      path.join(FIXTURES_DIR, 'synthetic-pl-semicolon-bom.csv'),
      path.join(priv, 'Klient A.csv'),
    );
    fs.copyFileSync(
      path.join(FIXTURES_DIR, 'synthetic-unknown-headers.csv'),
      path.join(priv, 'Klient B.csv'),
    );
    fs.writeFileSync(
      path.join(priv, 'Klient C.csv'),
      'Czas publikacji;Polubienia;Komentarze\n2026-09-01 10:00;5;1\n',
    );
    const lines: string[] = [];
    const report = anonymizeDirectory(priv, out, (line) => lines.push(line));

    expect(report.allPass).toBe(false);
    expect(report.failed).toEqual([{ source: 'Klient B.csv', reason: expect.any(String) }]);
    expect(report.written).toEqual([
      { source: 'Klient A.csv', out: 'real-pl-semicolon-utf-8-bom-2026-08-2026-09.csv', pass: true },
      { source: 'Klient C.csv', out: 'real-pl-semicolon-utf-8-bez-dat.csv', pass: false },
    ]);
    expect(fs.readdirSync(out).sort()).toEqual(report.written.map((w) => w.out).sort());
    expect(lines.filter((line) => line.includes('NIE SPEŁNIA'))).toHaveLength(2);
    // Nazwa wyniku nie zdradza nazwy pliku źródłowego.
    expect(fs.readdirSync(out).join(' ')).not.toContain('Klient');
  });

  it('same poprawne pliki: warunek spełniony', () => {
    const priv = tmp();
    const out = tmp();
    fs.copyFileSync(path.join(FIXTURES_DIR, 'synthetic-en-comma.csv'), path.join(priv, 'a.csv'));
    fs.copyFileSync(path.join(FIXTURES_DIR, 'synthetic-tab.csv'), path.join(priv, 'b.CSV'));
    fs.writeFileSync(path.join(priv, 'notatki.txt'), 'nie CSV');
    const report = anonymizeDirectory(priv, out);
    expect(report.allPass).toBe(true);
    expect(report.written.map((w) => w.source)).toEqual(['a.csv', 'b.CSV']);
  });
});

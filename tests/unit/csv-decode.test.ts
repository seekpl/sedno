import { describe, expect, it } from 'vitest';
import { checkFileMeta, decodeBytes } from '@/lib/csv/decode';
import { LIMITS } from '@/lib/csv/types';
import { encodeCp1250 } from '@/scripts/make-fixtures';

const TEXT = 'Czas publikacji;Wyświetlenia;Zasięg\n2026-09-01 10:00;1 234;800\n';

function utf16(text: string, endian: 'le' | 'be', bom: boolean): Uint8Array {
  const out: number[] = bom ? (endian === 'le' ? [0xff, 0xfe] : [0xfe, 0xff]) : [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const lo = code & 0xff;
    const hi = code >> 8;
    out.push(...(endian === 'le' ? [lo, hi] : [hi, lo]));
  }
  return new Uint8Array(out);
}

describe('checkFileMeta', () => {
  const ok = { fileName: 'eksport.csv', mimeType: 'text/csv', size: 100 };

  it.each([
    ['text/csv'],
    ['text/plain'],
    ['text/csv; charset=utf-8'],
    [''],
    ['application/vnd.ms-excel'],
    ['application/csv'],
    ['application/x-csv'],
    ['Application/VND.MS-EXCEL'],
  ])('przyjmuje MIME %j', (mimeType) => {
    expect(checkFileMeta({ ...ok, mimeType })).toBeNull();
  });

  it.each([
    ['application/octet-stream'],
    ['application/pdf'],
    ['image/png'],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ])('odrzuca MIME %j → E_NOT_CSV', (mimeType) => {
    expect(checkFileMeta({ ...ok, mimeType })).toEqual({ code: 'E_NOT_CSV' });
  });

  it('rozszerzenie .csv bez względu na wielkość liter', () => {
    expect(checkFileMeta({ ...ok, fileName: 'EKSPORT.CSV' })).toBeNull();
    expect(checkFileMeta({ ...ok, fileName: 'eksport.Csv' })).toBeNull();
    for (const fileName of ['eksport.txt', 'eksport.xlsx', 'eksport.csv.exe', 'eksport', 'csv']) {
      expect(checkFileMeta({ ...ok, fileName })).toEqual({ code: 'E_NOT_CSV' });
    }
  });

  it('rozmiar powyżej 10 MB → E_TOO_BIG (size); równo 10 MB przechodzi', () => {
    expect(checkFileMeta({ ...ok, size: LIMITS.maxBytes })).toBeNull();
    expect(checkFileMeta({ ...ok, size: LIMITS.maxBytes + 1 })).toEqual({
      code: 'E_TOO_BIG',
      reason: 'size',
    });
  });

  it('najpierw „to nie CSV”, potem rozmiar', () => {
    expect(checkFileMeta({ fileName: 'film.mp4', mimeType: 'video/mp4', size: LIMITS.maxBytes * 3 })).toEqual(
      {
        code: 'E_NOT_CSV',
      },
    );
  });
});

describe('decodeBytes', () => {
  it('UTF-8 bez BOM', () => {
    const result = decodeBytes(new TextEncoder().encode(TEXT));
    expect(result).toMatchObject({ ok: true, text: TEXT, encoding: 'utf-8', guessed: false, bom: false });
  });

  it('UTF-8 z BOM: BOM znika z tekstu', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(TEXT)]);
    const result = decodeBytes(bytes);
    expect(result).toMatchObject({ ok: true, text: TEXT, encoding: 'utf-8', bom: true, guessed: false });
  });

  it('UTF-16 LE z BOM', () => {
    expect(decodeBytes(utf16(TEXT, 'le', true))).toMatchObject({
      ok: true,
      text: TEXT,
      encoding: 'utf-16le',
    });
  });

  it('UTF-16 BE z BOM', () => {
    expect(decodeBytes(utf16(TEXT, 'be', true))).toMatchObject({
      ok: true,
      text: TEXT,
      encoding: 'utf-16be',
    });
  });

  it('UTF-16 LE bez BOM (hipoteza: Excel „Tekst Unicode”)', () => {
    expect(decodeBytes(utf16(TEXT, 'le', false))).toMatchObject({
      ok: true,
      text: TEXT,
      encoding: 'utf-16le',
    });
  });

  it('windows-1250 bez BOM → zgadnięte kodowanie i ostrzeżenie', () => {
    const result = decodeBytes(encodeCp1250(TEXT));
    expect(result).toMatchObject({ ok: true, text: TEXT, encoding: 'windows-1250', guessed: true });
  });

  it('UTF-8 z pojedynczym uszkodzonym bajtem (np. ucięte emoji w opisie) zostaje UTF-8', () => {
    const bytes = new TextEncoder().encode(TEXT);
    const broken = new Uint8Array([...bytes.slice(0, -4), 0xf0, 0x9f, ...bytes.slice(-4)]);
    const result = decodeBytes(broken);
    expect(result).toMatchObject({ ok: true, encoding: 'utf-8', guessed: false });
    expect(result.ok && result.text.startsWith('Czas publikacji;Wyświetlenia;Zasięg\n')).toBe(true);
  });

  it('poprawny UTF-8 z dosłownym znakiem U+FFFD zostaje UTF-8', () => {
    const text = 'Czas publikacji;Opis;Wyświetlenia\n2026-09-01 10:00;znak \uFFFD w opisie;5\n';
    expect(decodeBytes(new TextEncoder().encode(text))).toMatchObject({
      ok: true,
      text,
      encoding: 'utf-8',
      guessed: false,
    });
    const ascii = 'Publish time,Description,Views\n09/01/2026 10:00,\uFFFD,5\n';
    expect(decodeBytes(new TextEncoder().encode(ascii))).toMatchObject({
      ok: true,
      text: ascii,
      guessed: false,
    });
  });

  it('windows-1250 z wielkimi literami (część bajtów tworzy poprawne sekwencje UTF-8) → windows-1250', () => {
    const text = 'Czas publikacji;Opis;Wyświetlenia\n01.09.2026 10:00;ŻÓŁTA ŁĄKA, ŚWIEŻE ĆMY — ZAŻÓŁĆ;5\n';
    expect(decodeBytes(encodeCp1250(text))).toMatchObject({
      ok: true,
      text,
      encoding: 'windows-1250',
      guessed: true,
    });
  });

  it('przyjmuje ArrayBuffer', () => {
    const bytes = new TextEncoder().encode(TEXT);
    expect(decodeBytes(bytes.buffer)).toMatchObject({ ok: true, text: TEXT });
  });

  it('znak NUL → E_NOT_CSV (plik binarny z nazwą .csv)', () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x41, 0x42]);
    expect(decodeBytes(bytes)).toEqual({ ok: false, error: { code: 'E_NOT_CSV' } });
  });

  it.each([
    ['0 bajtów', new Uint8Array(0)],
    ['sam BOM UTF-8', new Uint8Array([0xef, 0xbb, 0xbf])],
    ['sam BOM UTF-16', new Uint8Array([0xff, 0xfe])],
    ['same spacje i nowe linie', new TextEncoder().encode('  \r\n\n\t \n')],
    ['BOM i nowe linie', new Uint8Array([0xef, 0xbb, 0xbf, 0x0a, 0x0d, 0x0a])],
  ])('%s → E_EMPTY', (_, bytes) => {
    expect(decodeBytes(bytes)).toEqual({ ok: false, error: { code: 'E_EMPTY' } });
  });
});

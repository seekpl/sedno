/**
 * Warunek publicznego startu (docs/decisions.md p. 19, docs/launch-checklist.md): każdy zanonimizowany
 * prawdziwy eksport (tests/fixtures/real-*.csv, z scripts/anonymize-exports.ts) parsuje się
 * BEZ mapowania ręcznego. Dopóki prawdziwych plików nie ma, test jest pominięty.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeHeader, matchHeader } from '@/lib/csv/columns';
import { decodeBytes } from '@/lib/csv/decode';
import { detectDelimiter, locateHeaderRow, parseExport, tokenize } from '@/lib/csv/parse';
import { FIXTURES_DIR } from '@/scripts/make-fixtures';

const REAL = fs.existsSync(FIXTURES_DIR)
  ? fs
      .readdirSync(FIXTURES_DIR)
      .filter((name) => /^real-.*\.csv$/i.test(name))
      .sort()
  : [];

describe('prawdziwe eksporty (zanonimizowane)', () => {
  if (REAL.length === 0) {
    it.skip('brak plików real-*.csv — wrzuć eksporty do tests/fixtures/private/ i uruchom scripts/anonymize-exports.ts', () => {});
    return;
  }

  describe.each(REAL)('%s', (name) => {
    const buf = fs.readFileSync(path.join(FIXTURES_DIR, name));
    const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;

    it('parsuje się bez mapowania ręcznego', () => {
      const result = parseExport({ bytes, fileName: name, mimeType: 'text/csv' });
      if (!result.ok) throw new Error(`${name}: ${JSON.stringify(result.error)}`);
      expect(result.data.rows.length).toBeGreaterThan(0);
      expect(result.data.fields).toContain('publishedAt');
      expect(result.data.fields.some((f) => f === 'views' || f === 'reach')).toBe(true);
    });

    it('jest zanonimizowany: bez opisów, permalinków i adresów', () => {
      const decoded = decodeBytes(bytes);
      if (!decoded.ok) throw new Error(decoded.error.code);
      const rows = tokenize(decoded.text, detectDelimiter(decoded.text));
      // Nagłówek tak, jak wybiera go parser (także gdy ma mniej niż 3 znane kolumny).
      const header = rows[locateHeaderRow(rows)] ?? [];
      expect(header.length).toBeGreaterThan(0);
      for (const cell of header) {
        const field = matchHeader(cell)?.field;
        expect(field, `kolumna „${cell}”`).toBeDefined();
        expect(['description', 'permalink'], normalizeHeader(cell)).not.toContain(field);
      }
      expect(decoded.text).not.toMatch(/https?:\/\/|www\./i);
    });
  });
});

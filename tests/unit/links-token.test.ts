/**
 * Token linku do raportu (lib/links/token.ts): 22 znaki base62, CSPRNG, losowanie z odrzucaniem
 * (bez przewagi pierwszych znaków alfabetu), ≥ 128 bitów, format zgodny z kolumną share_links.token.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  generateShareToken,
  isShareTokenFormat,
  sharePath,
  shareUrl,
  TOKEN_ACCEPT_BELOW,
  TOKEN_ALPHABET,
  TOKEN_LENGTH,
  TOKEN_PATTERN,
} from '@/lib/links/token';

/** Wzorzec z ograniczenia kolumny share_links.token w migracji kont. */
function migrationTokenPattern(): RegExp {
  const sql = fs.readFileSync(path.resolve('supabase/migrations/20261013000000_accounts.sql'), 'utf8');
  const match = /token text primary key check \(token ~ '([^']+)'\)/.exec(sql);
  if (!match?.[1]) throw new Error('brak ograniczenia formatu tokenu w migracji');
  return new RegExp(match[1]);
}

const DB_PATTERN = migrationTokenPattern();

describe('generateShareToken', () => {
  it('format jest ten sam co w bazie (share_links.token)', () => {
    expect(TOKEN_PATTERN.source).toBe(DB_PATTERN.source);
  });

  it('ma 22 znaki z alfabetu base62 i co najmniej 128 bitów', () => {
    expect(TOKEN_ALPHABET).toHaveLength(62);
    expect(new Set(TOKEN_ALPHABET).size).toBe(62);
    expect(TOKEN_LENGTH * Math.log2(TOKEN_ALPHABET.length)).toBeGreaterThanOrEqual(128);
    for (let i = 0; i < 200; i++) {
      const token = generateShareToken();
      expect(token).toHaveLength(22);
      expect(token).toMatch(TOKEN_PATTERN);
      expect(token).toMatch(DB_PATTERN);
    }
  });

  it('korzysta z crypto.getRandomValues', () => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    generateShareToken();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('odrzuca bajty 248–255 (bez przewagi pierwszych znaków alfabetu)', () => {
    expect(TOKEN_ACCEPT_BELOW).toBe(248);
    // Pierwsza porcja: same bajty do odrzucenia i kilka przyjętych; druga dopełnia token.
    const batches = [
      Uint8Array.from([248, 255, 250, 0, 61, 62, 247, ...Array<number>(37).fill(255)]),
      Uint8Array.from(Array.from({ length: 44 }, (_, i) => i)),
    ];
    const random = vi.fn((length: number) => {
      const next = batches.shift() ?? new Uint8Array(length);
      expect(next.length).toBe(length);
      return next;
    });
    const token = generateShareToken(random);
    // 0 → „0”, 61 → „z”, 62 → „0” (62 mod 62), 247 → 247 mod 62 = 61 → „z”; potem 0, 1, 2…
    expect(token.slice(0, 4)).toBe('0z0z');
    expect(token.slice(4)).toBe(TOKEN_ALPHABET.slice(0, 18));
    expect(random).toHaveBeenCalledTimes(2);
  });

  it('każdy bajt przyjęty trafia na znak z prawdopodobieństwem 4/248 (rozkład jednostajny)', () => {
    // Pełny przegląd bajtów 0–247: każdy znak alfabetu dokładnie 4 razy.
    const counts = new Map<string, number>();
    const bytes = Array.from({ length: TOKEN_ACCEPT_BELOW }, (_, i) => i);
    for (let i = 0; i < bytes.length; i += TOKEN_LENGTH) {
      const chunk = bytes.slice(i, i + TOKEN_LENGTH);
      while (chunk.length < TOKEN_LENGTH * 2) chunk.push(255);
      const queue = [Uint8Array.from(chunk), Uint8Array.from(Array<number>(TOKEN_LENGTH * 2).fill(0))];
      const token = generateShareToken(() => queue.shift()!);
      const used = Math.min(TOKEN_LENGTH, bytes.length - i);
      for (const ch of token.slice(0, used)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    expect(counts.size).toBe(62);
    expect(new Set(counts.values())).toEqual(new Set([4]));
  });

  it('na dużej próbie z CSPRNG znaki są rozłożone równo (test chi-kwadrat)', () => {
    const counts = new Map<string, number>();
    const tokens = 4000;
    for (let i = 0; i < tokens; i++) {
      for (const ch of generateShareToken()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    const expected = (tokens * TOKEN_LENGTH) / 62;
    const chi = [...TOKEN_ALPHABET].reduce(
      (sum, ch) => sum + ((counts.get(ch) ?? 0) - expected) ** 2 / expected,
      0,
    );
    // 61 stopni swobody: p = 0,0001 przy ok. 112. Przy przewadze modulo (bez odrzucania) wynik byłby wyższy.
    expect(chi).toBeLessThan(112);
  });

  it('kolejne tokeny się nie powtarzają', () => {
    const seen = new Set(Array.from({ length: 1000 }, () => generateShareToken()));
    expect(seen.size).toBe(1000);
  });
});

describe('isShareTokenFormat', () => {
  it('przyjmuje wyłącznie 22 znaki base62', () => {
    expect(isShareTokenFormat(generateShareToken())).toBe(true);
    expect(isShareTokenFormat('a'.repeat(21))).toBe(false);
    expect(isShareTokenFormat('a'.repeat(23))).toBe(false);
    expect(isShareTokenFormat(`${'a'.repeat(21)}-`)).toBe(false);
    expect(isShareTokenFormat(`${'a'.repeat(21)}ą`)).toBe(false);
    expect(isShareTokenFormat(null)).toBe(false);
  });
});

describe('adres linku', () => {
  it('/r/{token} pod adresem strony, bez podwójnego ukośnika', () => {
    expect(sharePath('AbCdEfGhIjKlMnOpQrStUv')).toBe('/r/AbCdEfGhIjKlMnOpQrStUv');
    expect(shareUrl('AbCdEfGhIjKlMnOpQrStUv', 'https://sedno.example/')).toBe(
      'https://sedno.example/r/AbCdEfGhIjKlMnOpQrStUv',
    );
    expect(shareUrl('AbCdEfGhIjKlMnOpQrStUv', 'http://localhost:3000')).toBe(
      'http://localhost:3000/r/AbCdEfGhIjKlMnOpQrStUv',
    );
  });
});

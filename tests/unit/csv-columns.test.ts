import { describe, expect, it } from 'vitest';
import {
  FIELD_KEYS,
  SYNONYMS,
  fieldForHeader,
  isFieldKey,
  matchHeader,
  normalizeHeader,
} from '@/lib/csv/columns';

describe('normalizeHeader', () => {
  it.each([
    ['Wyświetlenia', 'wyswietlenia'],
    ['ZASIĘG', 'zasieg'],
    ['Udostępnienia', 'udostepnienia'],
    ['Nowi obserwujący', 'nowi obserwujacy'],
    ['Łącznie', 'lacznie'],
    ['Konta, do których dotarto', 'konta, do ktorych dotarto'],
    ['  Publish   time  ', 'publish time'],
    ['"Views"', 'views'],
    ['„Czas publikacji”', 'czas publikacji'],
    ['\uFEFFIdentyfikator posta', 'identyfikator posta'],
    ['Zażółć gęślą jaźń', 'zazolc gesla jazn'],
    ["'Opis'", 'opis'],
  ])('%j → %j', (raw, expected) => {
    expect(normalizeHeader(raw)).toBe(expected);
  });
});

describe('synonimy kolumn (PROMPT.md §6)', () => {
  it.each([
    ['Publish time', 'publishedAt'],
    ['Czas publikacji', 'publishedAt'],
    ['Data publikacji', 'publishedAt'],
    ['Date', 'publishedAt'],
    ['Data', 'publishedAt'],
    ['Views', 'views'],
    ['Wyświetlenia', 'views'],
    ['Reach', 'reach'],
    ['Zasięg', 'reach'],
    ['Accounts reached', 'reach'],
    ['Konta, do których dotarto', 'reach'],
    ['Likes', 'likes'],
    ['Polubienia', 'likes'],
    ['Reakcje', 'likes'],
    ['Comments', 'comments'],
    ['Komentarze', 'comments'],
    ['Shares', 'shares'],
    ['Udostępnienia', 'shares'],
    ['Saves', 'saves'],
    ['Zapisania', 'saves'],
    ['Follows', 'follows'],
    ['Obserwacje', 'follows'],
    ['Nowi obserwujący', 'follows'],
    ['Post type', 'type'],
    ['Typ posta', 'type'],
    ['Typ', 'type'],
    ['Content type', 'type'],
    ['Permalink', 'permalink'],
    ['Link', 'permalink'],
    ['Description', 'description'],
    ['Opis', 'description'],
  ])('%s → %s', (header, field) => {
    expect(fieldForHeader(header)).toBe(field);
  });

  it('nigdy nie mapuje „Impressions” ani innych metryk na wyświetlenia', () => {
    for (const header of [
      'Impressions',
      'Wyświetlenia (impressions)',
      'Plays',
      'Odtworzenia',
      'Views (lifetime)',
    ]) {
      expect(fieldForHeader(header)).not.toBe('views');
    }
    expect(fieldForHeader('Impressions')).toBeNull();
  });

  it('dopasowuje dokładnie, nie fragmentem', () => {
    expect(fieldForHeader('Komentarz do danych')).toBeNull();
    expect(fieldForHeader('Data comment')).toBeNull();
    expect(fieldForHeader('Nazwa konta')).toBeNull();
    expect(fieldForHeader('Konta')).toBeNull();
    expect(fieldForHeader('Account ID')).toBeNull();
  });

  it('„konta, do ktorych dotarto” to jeden synonim (z przecinkiem)', () => {
    expect(SYNONYMS.reach).toContain('konta, do ktorych dotarto');
    expect(fieldForHeader('konta')).toBeNull();
    expect(fieldForHeader('do których dotarto')).toBeNull();
  });

  it('synonim wcześniej na liście ma niższą pozycję („Publish time” przed „Date”)', () => {
    expect(matchHeader('Publish time')!.rank).toBeLessThan(matchHeader('Date')!.rank);
    expect(matchHeader('Czas publikacji')!.rank).toBeLessThan(matchHeader('Data')!.rank);
  });

  it('każdy synonim jest już znormalizowany i przypisany do jednego pola', () => {
    const seen = new Set<string>();
    for (const field of FIELD_KEYS) {
      for (const synonym of SYNONYMS[field]) {
        expect(normalizeHeader(synonym)).toBe(synonym);
        expect(seen.has(synonym)).toBe(false);
        seen.add(synonym);
      }
    }
  });

  it('isFieldKey', () => {
    expect(isFieldKey('views')).toBe(true);
    expect(isFieldKey('impressions')).toBe(false);
    expect(isFieldKey(1)).toBe(false);
  });
});

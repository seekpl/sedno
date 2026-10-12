/**
 * Rozpoznawanie kolumn eksportu Meta Business Suite (PROMPT.md §6).
 * Nagłówek normalizujemy i porównujemy dokładnie z listą synonimów — bez dopasowań częściowych,
 * żeby np. „Impressions” nigdy nie trafiło do wyświetleń (to inna metryka).
 */
import type { FieldKey } from './types';

/** Wszystkie pola w stałej kolejności (tak też zwracamy `ParsedExport.fields`). */
export const FIELD_KEYS: readonly FieldKey[] = [
  'publishedAt',
  'views',
  'reach',
  'likes',
  'comments',
  'shares',
  'saves',
  'follows',
  'type',
  'permalink',
  'description',
];

export function isFieldKey(value: unknown): value is FieldKey {
  return typeof value === 'string' && (FIELD_KEYS as readonly string[]).includes(value);
}

/** Polskie litery, których NFD nie rozkłada (ł nie ma znaku łączącego). */
const PL_BASE: Record<string, string> = { ł: 'l', Ł: 'l' };

/** Cudzysłowy i apostrofy usuwane z nagłówka: " ' ` „ ” “ » « ‘ ’ ‚ ‹ › */
const QUOTES = /["'`„”“»«‘’‚‹›]/g;

/**
 * Normalizacja nagłówka: małe litery, bez polskich znaków (także ł → l), bez cudzysłowów i BOM,
 * przycięty, ze zwiniętymi spacjami (również twardymi).
 */
export function normalizeHeader(raw: string): string {
  return raw
    .replace(/\uFEFF/g, '')
    .replace(/[łŁ]/g, (ch) => PL_BASE[ch] ?? ch)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(QUOTES, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Mapa synonimów (po normalizacji). Kolejność w liście ma znaczenie: gdy dwie kolumny pasują do tego
 * samego pola, wygrywa ta z synonimem wcześniej na liście (np. „Publish time” przed „Date”, bo
 * w eksporcie bywa też kolumna „Date” z wartością „Lifetime”). To hipotezy do potwierdzenia
 * na prawdziwych plikach (PROMPT.md §19, docs/decisions.md p. 19).
 */
export const SYNONYMS: Record<FieldKey, readonly string[]> = {
  publishedAt: [
    'publish time',
    'czas publikacji',
    'data publikacji',
    // hipoteza dodatkowa: warianty spotykane w innych wersjach eksportu
    'publish date',
    'opublikowano',
    'date',
    'data',
  ],
  views: ['views', 'wyswietlenia'],
  reach: ['reach', 'zasieg', 'accounts reached', 'konta, do ktorych dotarto'],
  likes: [
    'likes',
    'polubienia',
    'reakcje',
    // hipoteza dodatkowa: angielska nazwa reakcji
    'reactions',
  ],
  comments: ['comments', 'komentarze'],
  shares: ['shares', 'udostepnienia'],
  saves: ['saves', 'zapisania'],
  follows: ['follows', 'obserwacje', 'nowi obserwujacy'],
  type: [
    'post type',
    'typ posta',
    'typ',
    'content type',
    // hipoteza dodatkowa
    'typ tresci',
    'typ publikacji',
    'type',
  ],
  permalink: ['permalink', 'link'],
  description: [
    'description',
    'opis',
    // hipoteza dodatkowa: rozpoznajemy, żeby na pewno nigdy nie czytać treści posta
    'caption',
    'podpis',
    'title',
    'tytul',
  ],
};

type Match = { field: FieldKey; rank: number };

const BY_SYNONYM: ReadonlyMap<string, Match> = (() => {
  const map = new Map<string, Match>();
  for (const field of FIELD_KEYS) {
    SYNONYMS[field].forEach((synonym, rank) => {
      if (map.has(synonym)) throw new Error(`Synonim „${synonym}” przypisany do dwóch pól`);
      map.set(synonym, { field, rank });
    });
  }
  return map;
})();

/** Pole dla nagłówka (dokładne dopasowanie po normalizacji) wraz z pozycją synonimu na liście. */
export function matchHeader(raw: string): Match | null {
  return BY_SYNONYM.get(normalizeHeader(raw)) ?? null;
}

/** Pole dla nagłówka albo null, gdy nagłówek jest nieznany. */
export function fieldForHeader(raw: string): FieldKey | null {
  return matchHeader(raw)?.field ?? null;
}

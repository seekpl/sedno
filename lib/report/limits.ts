/**
 * Granice danych raportu — jedno źródło dla schematu (lib/report/types.ts), parsera i obliczeń.
 * Bez importu zod, żeby parser w Web Workerze i obliczenia nie ciągnęły go do paczki.
 */

/** Permalink publikacji: wyłącznie https://www.instagram.com/… (docs/decisions.md, p. 16). */
export const INSTAGRAM_PERMALINK_PATTERN = /^https:\/\/www\.instagram\.com\/[A-Za-z0-9._\-/?=&%]*$/;
export const INSTAGRAM_PERMALINK_MAX = 300;

/** Największa liczba w raporcie (liczniki, sumy miesiąca). */
export const MAX_COUNT = 1_000_000_000;

export function isAllowedPermalink(url: string): boolean {
  return url.length <= INSTAGRAM_PERMALINK_MAX && INSTAGRAM_PERMALINK_PATTERN.test(url);
}

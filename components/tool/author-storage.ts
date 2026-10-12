/**
 * Nazwa SMM-owca na raporcie, zapamiętana w localStorage tej przeglądarki (jedyny wpis narzędzia obok
 * zapamiętanego mapowania kolumn). Każdy dostęp w try/catch: tryb prywatny i zablokowane dane witryny
 * nie psują narzędzia — nazwa działa wtedy tylko do zamknięcia karty.
 */
export const AUTHOR_NAME_KEY = 'sedno.authorName';

/** Ten sam limit co pole i reportDataSchema (author.name ≤ 80 znaków). */
export const AUTHOR_NAME_MAX = 80;

export function loadAuthorName(): string {
  try {
    const value = window.localStorage.getItem(AUTHOR_NAME_KEY);
    return value ? value.slice(0, AUTHOR_NAME_MAX) : '';
  } catch {
    return '';
  }
}

export function saveAuthorName(name: string): void {
  try {
    const value = name.trim().slice(0, AUTHOR_NAME_MAX);
    if (value) window.localStorage.setItem(AUTHOR_NAME_KEY, value);
    else window.localStorage.removeItem(AUTHOR_NAME_KEY);
  } catch {
    // Brak miejsca albo zablokowany localStorage: nazwa zostaje tylko w tej karcie.
  }
}

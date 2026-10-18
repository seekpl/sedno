/**
 * Token linku do raportu (PROMPT.md §8, §15): 22 znaki base62 z CSPRNG (crypto.getRandomValues).
 * 22 × log2(62) ≈ 131 bitów (≥ 128). Losowanie z odrzucaniem: bajt ≥ 248 (= 4 × 62) odrzucamy, więc każdy
 * znak alfabetu ma dokładnie to samo prawdopodobieństwo (bez „modulo bias”). Format pilnuje też baza
 * (check token ~ '^[0-9A-Za-z]{22}$' w supabase/migrations/20261013000000_accounts.sql).
 */

export const TOKEN_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const TOKEN_LENGTH = 22;
export const TOKEN_PATTERN = /^[0-9A-Za-z]{22}$/;

/** Największa wielokrotność 62 mieszcząca się w bajcie: bajty 248–255 są odrzucane. */
export const TOKEN_ACCEPT_BELOW = 256 - (256 % TOKEN_ALPHABET.length);

/** Źródło losowych bajtów (podmieniane w testach). Domyślnie Web Crypto: przeglądarka i Node ≥ 19. */
export type RandomBytes = (length: number) => Uint8Array;

const cryptoBytes: RandomBytes = (length) => globalThis.crypto.getRandomValues(new Uint8Array(length));

/** Nowy token linku: 22 znaki base62, rozkład jednostajny. */
export function generateShareToken(random: RandomBytes = cryptoBytes): string {
  let token = '';
  while (token.length < TOKEN_LENGTH) {
    // Z zapasem: średnio odrzucamy 8/256 bajtów, więc jedna porcja prawie zawsze wystarcza.
    for (const byte of random(TOKEN_LENGTH * 2)) {
      if (byte >= TOKEN_ACCEPT_BELOW) continue;
      token += TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length];
      if (token.length === TOKEN_LENGTH) break;
    }
  }
  return token;
}

export function isShareTokenFormat(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

/** Ścieżka raportu publicznego (kontrakt tras: /r/{token}). */
export function sharePath(token: string): string {
  return `/r/${token}`;
}

/** Pełny adres linku do raportu: adres strony (NEXT_PUBLIC_SITE_URL, bez końcowego ukośnika) + /r/{token}. */
export function shareUrl(token: string, siteBase: string): string {
  return `${siteBase.replace(/\/+$/, '')}${sharePath(token)}`;
}

/**
 * Content Security Policy rozdzielona według tras (docs/decisions.md, p. 16).
 *
 * - static: strony marketingowe (statyczne). script-src 'self' 'unsafe-inline', bez 'unsafe-eval'.
 * - nonce:  /nowy, /app/*, /r/*, /logowanie. Nonce + 'strict-dynamic' z proxy.ts, renderowanie dynamiczne.
 *
 * Wszędzie: default-src 'self'; img-src 'self' data: blob:; worker-src 'self' blob:; object-src 'none';
 * base-uri 'none'; form-action 'self'; frame-ancestors 'none'.
 */

export type CspMode = 'static' | 'nonce';

/** Trasy z nonce (dynamiczne). Prefiksy ścieżek. */
export const NONCE_ROUTE_PREFIXES = ['/nowy', '/app', '/r', '/logowanie'] as const;

/** Trasy generujące PDF w przeglądarce — tylko tu ewentualne 'wasm-unsafe-eval' (p. 16). */
export const PDF_ROUTE_PREFIXES = ['/nowy', '/app', '/r'] as const;

/** Trasy, na których przeglądarka nie może łączyć się z niczym poza własnym serwerem (p. 16). */
export const SELF_ONLY_CONNECT_PREFIXES = ['/nowy'] as const;

/**
 * @react-pdf/renderer 4.9 układa strony silnikiem yoga-layout 3.2.1, który kompiluje WebAssembly
 * (WebAssembly.instantiate). Bez 'wasm-unsafe-eval' PDF nie powstanie. Dopuszczone tylko na trasach z PDF
 * (docs/decisions.md, p. 16 i 21). 'wasm-unsafe-eval' nie pozwala na eval() ani new Function().
 */
export const PDF_NEEDS_WASM_EVAL = true;

function matches(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function cspModeFor(pathname: string): CspMode {
  return matches(pathname, NONCE_ROUTE_PREFIXES) ? 'nonce' : 'static';
}

export type CspOptions = {
  pathname: string;
  nonce?: string;
  dev: boolean;
  /** Hosty Stripe w connect-src (od Fazy 3). */
  stripe?: boolean;
};

export function buildCsp({ pathname, nonce, dev, stripe = false }: CspOptions): string {
  const mode = cspModeFor(pathname);
  if (mode === 'nonce' && !nonce) throw new Error(`Trasa ${pathname} wymaga nonce`);
  const pdf = matches(pathname, PDF_ROUTE_PREFIXES) && PDF_NEEDS_WASM_EVAL;

  const script = mode === 'nonce' ? [`'nonce-${nonce}'`, "'strict-dynamic'"] : ["'self'", "'unsafe-inline'"];
  if (pdf) script.push("'wasm-unsafe-eval'");
  // React w trybie deweloperskim odtwarza stosy błędów przez eval (dokumentacja Next.js). Nigdy w produkcji.
  if (dev) script.push("'unsafe-eval'");

  // Przeglądarka nie łączy się z Supabase: logowanie, dane i logo idą przez serwer aplikacji
  // (docs/decisions.md, p. 93), więc poza Stripe (Faza 3) connect-src to tylko 'self'.
  const connect = ["'self'"];
  if (!matches(pathname, SELF_ONLY_CONNECT_PREFIXES) && stripe) connect.push('https://api.stripe.com');
  // Odświeżanie modułów w trybie deweloperskim (WebSocket do własnego serwera).
  if (dev) connect.push('ws:', 'wss:');

  // Style: atrybuty style="" (np. szerokość słupków raportu) nie mogą mieć nonce, więc na trasach z nonce
  // dopuszczamy je osobno przez style-src-attr; elementy <style> wymagają nonce.
  const style =
    mode === 'nonce' && !dev
      ? [`style-src 'self' 'nonce-${nonce}'`, "style-src-attr 'unsafe-inline'"]
      : ["style-src 'self' 'unsafe-inline'"];

  return [
    "default-src 'self'",
    `script-src ${script.join(' ')}`,
    ...style,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** Pozostałe nagłówki bezpieczeństwa (PROMPT.md §15), wspólne dla wszystkich tras. */
export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

/** Nonce: 128 bitów z CSPRNG, base64. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

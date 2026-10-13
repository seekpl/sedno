/**
 * Konfiguracja Supabase z env. Adres i klucz anon są publiczne (NEXT_PUBLIC_), klucz serwisowy tylko na serwerze.
 * Przeglądarka nie łączy się z Supabase: logowanie, dane i logo idą przez Server Actions i trasy aplikacji
 * (docs/decisions.md, p. 93), więc CSP ma connect-src 'self'.
 */
export type SupabasePublicEnv = { url: string; anonKey: string };

export function supabasePublicEnv(): SupabasePublicEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return url && anonKey ? { url, anonKey } : null;
}

export function requireSupabasePublicEnv(): SupabasePublicEnv {
  const env = supabasePublicEnv();
  if (!env) throw new Error('Brak NEXT_PUBLIC_SUPABASE_URL albo NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  return env;
}

/** Ciasteczka sesji: niedostępne dla JavaScriptu (httpOnly), bo przeglądarka nie używa klienta Supabase. */
export const SESSION_COOKIE_OPTIONS = {
  path: '/',
  sameSite: 'lax',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
} as const;

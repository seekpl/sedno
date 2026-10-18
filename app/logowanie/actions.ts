'use server';

/**
 * Prośba o link logowania (PROMPT.md §10, §15; docs/decisions.md, p. 93). Dla useActionState — działa też
 * bez JavaScriptu (formularz wysyła się zwykłym POST).
 *
 * - zod na wejściu: działanie (wyślij, wyślij ponownie, inny adres), e-mail (ta sama reguła ASCII co lista
 *   oczekujących), ścieżka powrotu (safeNextPath — tylko /app).
 * - Limity: 5 próśb na 10 minut z jednego adresu IP (IPv6: sieć /64) i 3 na 10 minut na jeden adres e-mail
 *   (klucz to skrót SHA-256 adresu, nigdy sam adres).
 * - Supabase Auth w trybie PKCE: weryfikator kodu trafia do ciasteczka httpOnly przez klienta serwera,
 *   więc link działa tylko w tej przeglądarce. Nowy adres zakłada konto przy pierwszym kliknięciu w link.
 * - Odpowiedź nie zdradza, czy konto z tym adresem istnieje. Adresu e-mail nie logujemy.
 * - Akcja nigdy nie rzuca wyjątku: formularz zawsze dostaje stan z przyczyną i naprawą.
 */
import { createHash } from 'node:crypto';
import { siteUrl } from '@/components/site/seo';
import { safeNextPath } from '@/lib/auth/next-path';
import { auth as t } from '@/lib/copy/auth';
import { clientRateLimitKey } from '@/lib/server/client-ip';
import { rateLimit } from '@/lib/server/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { z } from '@/lib/zod';

export type LoginState =
  /** Formularz adresu (z ewentualnym błędem pola albo komunikatem). */
  | { status: 'idle'; email?: string; fieldError?: string; message?: string }
  /** „Sprawdź skrzynkę”: link wysłany na `email`; `resent` po „Wyślij ponownie”. */
  | { status: 'sent'; email: string; resent?: boolean; message?: string };

// Plik 'use server' eksportuje wyłącznie akcję (i typy): każda eksportowana funkcja byłaby punktem
// wywołania z przeglądarki. Stałe i pomocnicze funkcje zostają prywatne.
const IP_LIMIT = 5;
const EMAIL_LIMIT = 3;
const WINDOW_MS = 10 * 60_000;

/** Ścieżka zwrotna z linku w e-mailu (route handler app/auth/potwierdz). */
const CONFIRM_PATH = '/auth/potwierdz';

const intentSchema = z.enum(['send', 'resend', 'change']).catch('send');

/** Ta sama reguła co w app/actions/waitlist.ts: trim, małe litery, do 254 znaków, adres ASCII. */
const emailSchema = z
  .string({ error: t.errors.emailRequired })
  .trim()
  .toLowerCase()
  .min(1, { error: t.errors.emailRequired })
  .max(254, { error: t.errors.emailTooLong })
  .pipe(z.email({ error: t.errors.emailInvalid }));

const nextSchema = z.string().max(2048).optional().catch(undefined);

function field(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

/** Klucz limitu dla adresu: skrót SHA-256 (adres nie trafia nawet do pamięci limitera). */
function emailRateLimitKey(email: string): string {
  return createHash('sha256').update(email).digest('hex');
}

/** Adres strony powrotu z e-maila: {site}/auth/potwierdz?next=… (next po safeNextPath). */
function confirmRedirectUrl(next: string): string {
  return `${siteUrl()}${CONFIRM_PATH}?next=${encodeURIComponent(safeNextPath(next))}`;
}

export async function requestMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  try {
    return await request(formData);
  } catch {
    // Nieoczekiwany błąd (np. wejście, które nie jest formularzem). Bez treści wejścia w logu.
    console.error('[sedno] Prośba o link logowania nie powiodła się.');
    return { status: 'idle', message: t.errors.failed };
  }
}

async function request(formData: FormData): Promise<LoginState> {
  const intent = intentSchema.parse(field(formData, 'intent'));
  if (intent === 'change') return { status: 'idle' };

  const rawEmail = field(formData, 'email');
  const echo = rawEmail?.trim().slice(0, 254);
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) {
    return {
      status: 'idle',
      email: echo,
      fieldError: parsed.error.issues[0]?.message ?? t.errors.emailInvalid,
    };
  }
  const email = parsed.data;
  const next = safeNextPath(nextSchema.parse(field(formData, 'next')));
  // Błąd przy „Wyślij ponownie” zostaje na ekranie „Sprawdź skrzynkę”, przy pierwszej prośbie — w formularzu.
  const failure = (message: string): LoginState =>
    intent === 'resend' ? { status: 'sent', email, message } : { status: 'idle', email, message };

  const ip = await clientRateLimitKey();
  if (!rateLimit(`login-ip:${ip}`, IP_LIMIT, WINDOW_MS)) return failure(t.errors.rateLimitedIp);
  if (!rateLimit(`login-email:${emailRateLimitKey(email)}`, EMAIL_LIMIT, WINDOW_MS)) {
    return failure(t.errors.rateLimitedEmail);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: confirmRedirectUrl(next), shouldCreateUser: true },
  });
  if (error) {
    // Tylko kod błędu dostawcy, nigdy adres ani treść komunikatu (może zawierać adres).
    console.error(`[sedno] Supabase Auth nie wysłał linku (${error.code ?? error.status ?? 'brak kodu'}).`);
    if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
      return failure(t.errors.providerRateLimited);
    }
    if (error.code === 'email_address_invalid') {
      return { status: 'idle', email, fieldError: t.errors.emailInvalid };
    }
    return failure(t.errors.failed);
  }

  return { status: 'sent', email, ...(intent === 'resend' ? { resent: true } : {}) };
}

import { features } from '@/config/features';
import { getCurrentUser } from '@/lib/auth/session';
import { exportAccount, exportFileName } from '@/lib/data/account';
import { rateLimit } from '@/lib/server/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Najwyżej 10 eksportów na minutę na konto (każdy to kilka zapytań do bazy). */
const LIMIT = 10;
const WINDOW_MS = 60_000;

const empty = (status: number, extra: Record<string, string> = {}) =>
  new Response(null, { status, headers: { 'Cache-Control': 'no-store', ...extra } });

/**
 * Eksport danych konta (PROMPT.md §8 „Eksport danych: JSON wszystkich raportów”, §15 RODO): profil,
 * klienci, raporty (ReportData) i linki zalogowanego użytkownika jako plik JSON do pobrania. Zapytania
 * przez sesję (RLS — tylko własne wiersze). Treści eksportu nie logujemy.
 * Ciasteczka sesji (SameSite=Lax) idą też z przejściem z obcej strony, więc żądanie z innej witryny
 * (Sec-Fetch-Site: cross-site / same-site) dostaje 403 — obca strona nie wywoła pobrania ani nie zużyje limitu.
 */
export async function GET(request: Request): Promise<Response> {
  if (!features.accounts) return empty(404);
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site' || site === 'same-site') return empty(403);
  const user = await getCurrentUser();
  if (!user) return empty(401);
  if (!rateLimit(`settings:export:${user.id}`, LIMIT, WINDOW_MS)) return empty(429, { 'Retry-After': '60' });

  const now = new Date();
  let data;
  try {
    data = await exportAccount(await createSupabaseServerClient(), { email: user.email }, now);
  } catch {
    console.error('[sedno] Eksport danych konta nie powiódł się.');
    return empty(503);
  }

  return new Response(`${JSON.stringify(data, null, 2)}\n`, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFileName(now)}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}

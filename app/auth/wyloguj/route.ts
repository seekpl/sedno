import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { features } from '@/config/features';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Ciasteczka sesji Supabase (sb-<projekt>-auth-token, także dzielone na części .0, .1… i weryfikator kodu). */
const SESSION_COOKIE = /^sb-.+-auth-token(?:[.-].*)?$/;

const notFound = () => new Response(null, { status: 404 });

/**
 * Wylogowanie (zwykły formularz POST w Ustawieniach): koniec tej sesji w Supabase Auth (zakres „local” —
 * inne urządzenia zostają zalogowane), usunięcie ciasteczek sesji i 303 na stronę główną. Ciasteczka
 * usuwamy także wtedy, gdy Supabase nie odpowie, więc na tym urządzeniu wylogowanie zawsze działa.
 * Ciasteczka mają SameSite=Lax, więc formularz z innej domeny nie wyśle sesji; odpowiedź mogłaby je jednak
 * usunąć, dlatego żądanie z innej witryny (Sec-Fetch-Site: cross-site / same-site) dostaje 403.
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (!features.accounts) return notFound();
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site' || site === 'same-site') {
    return new Response(null, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    console.error('[sedno] Wylogowanie w Supabase Auth nie powiodło się.');
  }
  const store = await cookies();
  for (const { name } of store.getAll()) {
    if (SESSION_COOKIE.test(name)) store.delete(name);
  }
  return new Response(null, { status: 303, headers: { Location: '/', 'Cache-Control': 'no-store' } });
}

/** Wylogowanie tylko metodą POST (link GET mógłby wylogować przez podgląd lub prefetch). */
function methodNotAllowed(): Response {
  if (!features.accounts) return notFound();
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;

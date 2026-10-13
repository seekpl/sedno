import { NextResponse, type NextRequest } from 'next/server';
import { features } from '@/config/features';
import { AFTER_LOGIN_PATH } from '@/lib/auth/next-path';
import { buildCsp, createNonce } from '@/lib/security/csp';
import { refreshSession } from '@/lib/supabase/proxy-session';

/**
 * Trasy dynamiczne (/nowy, /app, /r, /logowanie):
 * - CSP z nonce (docs/decisions.md, p. 16). Next.js odczytuje nonce z nagłówka CSP żądania.
 * - /app i /logowanie: odświeżenie sesji Supabase; /app bez sesji → /logowanie?next=…, zalogowany na
 *   /logowanie → panel (docs/decisions.md, p. 93).
 * Strony marketingowe dostają statyczną CSP z next.config.ts.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const nonce = createNonce();
  const csp = buildCsp({ pathname, nonce, dev: process.env.NODE_ENV === 'development' });

  const session =
    features.accounts && (pathname.startsWith('/app') || pathname === '/logowanie')
      ? await refreshSession(request)
      : null;

  if (session && pathname.startsWith('/app') && !session.user) {
    const login = new URL('/logowanie', request.url);
    login.searchParams.set('next', `${pathname}${search}`);
    return session.applyCookies(NextResponse.redirect(login));
  }
  if (session && pathname === '/logowanie' && session.user) {
    return session.applyCookies(NextResponse.redirect(new URL(AFTER_LOGIN_PATH, request.url)));
  }

  // Nagłówki żądania po odświeżeniu sesji (nowe ciasteczka widzą Server Components).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return session ? session.applyCookies(response) : response;
}

export const config = {
  matcher: [
    {
      source: '/(nowy|logowanie)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
    {
      source: '/(app|r)/:path*',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};

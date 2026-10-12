import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, createNonce } from '@/lib/security/csp';

/**
 * CSP z nonce dla tras dynamicznych (/nowy, /app, /r, /logowanie) — docs/decisions.md, p. 16.
 * Next.js odczytuje nonce z nagłówka CSP żądania i dokleja go do swoich skryptów.
 * Strony marketingowe dostają statyczną CSP z next.config.ts.
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp({
    pathname: request.nextUrl.pathname,
    nonce,
    dev: process.env.NODE_ENV === 'development',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
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

import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

function origin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

const supabase = origin(process.env.NEXT_PUBLIC_SUPABASE_URL);

/**
 * CSP (PROMPT.md §15). Strony marketingowe są statyczne, więc bez nonce: 'unsafe-inline' dla skryptów
 * Next.js. 'wasm-unsafe-eval' potrzebuje silnik układu w @react-pdf/renderer (PDF w przeglądarce).
 * Decyzja w docs/decisions.md.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${supabase ? ` ${supabase}` : ''}`,
  "font-src 'self'",
  `connect-src 'self'${supabase ? ` ${supabase}` : ''} https://api.stripe.com${isDev ? ' ws: wss:' : ''}`,
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Raport publiczny: bez nagłówka Referer (PROMPT.md §11).
      { source: '/r/:token*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
    ];
  },
};

export default nextConfig;

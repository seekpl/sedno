import createMDX from '@next/mdx';
import type { NextConfig } from 'next';
import { buildCsp, SECURITY_HEADERS } from './lib/security/csp';

const dev = process.env.NODE_ENV !== 'production';

/**
 * Statyczna CSP dla stron marketingowych i pozostałych tras bez nonce. Trasy z nonce
 * (/nowy, /app, /r, /logowanie) dostają CSP z proxy.ts — tu są wykluczone, żeby nie nakładać dwóch polityk.
 */
const STATIC_CSP_SOURCE = '/((?!(?:nowy|app|logowanie)(?:/|$)|r/).*)';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  reactStrictMode: true,
  pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
  experimental: {
    // Logo w Ustawieniach do 2 MB (PROMPT.md §15) + narzut formularza; domyślny limit akcji to 1 MB.
    serverActions: { bodySizeLimit: '3mb' },
  },
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      {
        source: STATIC_CSP_SOURCE,
        headers: [
          {
            key: 'Content-Security-Policy',
            value: buildCsp({ pathname: '/', dev }),
          },
        ],
      },
      // Raport publiczny: bez nagłówka Referer (PROMPT.md §11).
      { source: '/r/:token*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
    ];
  },
};

const withMDX = createMDX({});

export default withMDX(nextConfig);

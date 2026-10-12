import type { Metadata, Viewport } from 'next';
import { preload } from 'react-dom';
import { PRODUCT_NAME } from '@/config/brand';
import { copy } from '@/lib/copy/pl';
import { tokens } from '@/lib/brand/tokens.generated';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: { default: `${PRODUCT_NAME} — ${copy.landing.h1}`, template: `%s — ${PRODUCT_NAME}` },
  description: copy.meta.description,
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: tokens.colors.light.pen,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Bricolage renderuje hero i liczby od pierwszej klatki (brand/docs/6-przekazanie.md).
  preload('/fonts/BricolageGrotesque-Variable.woff2', {
    as: 'font',
    type: 'font/woff2',
    crossOrigin: 'anonymous',
  });
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}

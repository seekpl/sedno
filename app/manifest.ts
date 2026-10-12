import type { MetadataRoute } from 'next';
import { PRODUCT_NAME } from '@/config/brand';
import { tokens } from '@/lib/brand/tokens.generated';
import { copy } from '@/lib/copy/pl';

/** Manifest aplikacji (PROMPT.md §12): kolory z tokenów marki, ikony z brand/app-icons/ (public/). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUCT_NAME,
    short_name: PRODUCT_NAME,
    description: copy.meta.description,
    lang: 'pl',
    start_url: '/',
    display: 'standalone',
    background_color: tokens.colors.light.paper,
    theme_color: tokens.colors.light.pen,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}

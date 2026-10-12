import type { MetadataRoute } from 'next';
import { siteUrl } from '@/components/site/seo';
import { GUIDES } from '@/content/poradniki';

/**
 * sitemap.xml (PROMPT.md §12): strony publiczne. Bez szkiców stron prawnych (noindex), bez /app, /r i /dev.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const paths = [
    '/',
    '/przyklad',
    '/szablon',
    '/poradniki',
    ...GUIDES.map((g) => `/poradniki/${g.slug}`),
    '/nowy',
  ];
  return paths.map((path) => ({ url: path === '/' ? `${base}/` : `${base}${path}` }));
}

import type { MetadataRoute } from 'next';
import { siteUrl } from '@/components/site/seo';

/** robots.txt (PROMPT.md §12): bez aplikacji, raportów klientów (/r/) i stron deweloperskich. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/app', '/r/', '/dev'] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}

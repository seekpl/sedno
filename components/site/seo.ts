import type { Metadata } from 'next';
import { PRODUCT_NAME } from '@/config/brand';

/**
 * Adres strony bez końcowego ukośnika (sitemap, robots). Ten sam co metadataBase w app/layout.tsx;
 * bez NEXT_PUBLIC_SITE_URL — adres lokalny.
 */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '');
}

type PageMetadataInput = {
  /** Ścieżka strony, np. „/przyklad” (kanoniczny adres liczony od metadataBase). */
  path: string;
  /** Tytuł bez nazwy produktu — szablon „%s — Sedno” dokleja ją sam. */
  title: string;
  description?: string;
  /** Tytuł w całości, bez szablonu (strona główna). */
  absolute?: boolean;
  type?: 'website' | 'article';
  /** false dla szkiców (strony prawne): noindex, ale linki dalej prowadzą. */
  index?: boolean;
};

/**
 * Metadane strony marketingowej: tytuł, opis, adres kanoniczny i podstawowy Open Graph
 * (bez obrazu — obraz OG powstaje w Fazie 4, PROMPT.md §12).
 */
export function pageMetadata({
  path,
  title,
  description,
  absolute = false,
  type = 'website',
  index = true,
}: PageMetadataInput): Metadata {
  const fullTitle = absolute ? title : `${title} — ${PRODUCT_NAME}`;
  return {
    title: absolute ? { absolute: title } : title,
    ...(description ? { description } : {}),
    alternates: { canonical: path },
    openGraph: {
      type,
      locale: 'pl_PL',
      siteName: PRODUCT_NAME,
      title: fullTitle,
      url: path,
      ...(description ? { description } : {}),
    },
    ...(index ? {} : { robots: { index: false, follow: true } }),
  };
}

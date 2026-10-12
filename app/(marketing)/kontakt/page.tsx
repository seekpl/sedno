import type { Metadata } from 'next';
import { LegalPage } from '@/components/site/LegalPage';
import { pageMetadata } from '@/components/site/seo';
import { copy } from '@/lib/copy/pl';

// Szkic z miejscami do uzupełnienia przez prawnika — bez indeksowania i poza sitemap.
export const metadata: Metadata = pageMetadata({
  path: '/kontakt',
  title: copy.legalPages.contact.title,
  index: false,
});

export default function ContactPage() {
  return <LegalPage page="contact" />;
}

import type { Metadata } from 'next';
import { LegalPage } from '@/components/site/LegalPage';
import { pageMetadata } from '@/components/site/seo';
import { copy } from '@/lib/copy/pl';

// Szkic z miejscami do uzupełnienia przez prawnika — bez indeksowania i poza sitemap.
export const metadata: Metadata = pageMetadata({
  path: '/prywatnosc',
  title: copy.legalPages.privacy.title,
  index: false,
});

export default function PrivacyPage() {
  return <LegalPage page="privacy" />;
}

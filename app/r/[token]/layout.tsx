import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PRODUCT_NAME } from '@/config/brand';
import { share as t } from '@/lib/copy/share';
import { getSharedReport } from '@/lib/data/shared';
import { reportView } from '@/lib/report/format';

type Props = { params: Promise<{ token: string }> };

/** Raport klienta nie trafia do wyszukiwarek (PROMPT.md §11); robots.txt i tak blokuje /r/. */
const NO_INDEX = { index: false, follow: false } as const;

const UNAVAILABLE: Metadata = { title: { absolute: t.unavailableTitle }, robots: NO_INDEX };

/**
 * Metadane raportu publicznego w układzie segmentu, żeby obejmowały też not-found.tsx: tytuł „Raport za
 * {miesiąc} — {klient}”, noindex,nofollow, Open Graph ogólny (bez liczb i bez nazwy klienta). Odczyt jest ten
 * sam co na stronie (React cache), więc wyświetlenie liczy się raz. Błąd odczytu obsługuje strona (error.tsx).
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  let result;
  try {
    result = await getSharedReport(token);
  } catch {
    return UNAVAILABLE;
  }
  if (result.status !== 'ok') return UNAVAILABLE;
  return {
    title: { absolute: reportView(result.data).documentTitle },
    description: t.meta.description,
    robots: NO_INDEX,
    openGraph: {
      type: 'website',
      locale: 'pl_PL',
      siteName: PRODUCT_NAME,
      title: t.meta.ogTitle,
      description: t.meta.description,
    },
  };
}

export default function SharedReportLayout({ children }: { children: ReactNode }) {
  return children;
}

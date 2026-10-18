import type { Metadata } from 'next';
import { SharedMessage, splitFirstSentence } from '@/components/share/SharedMessage';
import { share as t } from '@/lib/copy/share';

export const metadata: Metadata = {
  title: { absolute: t.unavailableTitle },
  robots: { index: false, follow: false },
};

const [heading, detail] = splitFirstSentence(t.expired);

/**
 * Link wygasły, odwołany albo nieprawidłowy (PROMPT.md §11): dokładnie share.expired, jasny motyw, bez
 * żadnych danych raportu ani autora. Ten sam widok dla każdej przyczyny — nie zdradza, czy token istniał.
 */
export default function SharedReportNotFound() {
  return <SharedMessage heading={heading} detail={detail} />;
}

import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { Report } from '@/components/report/Report';
import { SharedMessage } from '@/components/share/SharedMessage';
import { SharedPdfButton } from '@/components/share/SharedPdfButton';
import { ToastProvider } from '@/components/ui/Toast';
import { share as t } from '@/lib/copy/share';
import { getSharedReport } from '@/lib/data/shared';
import { recordServerEvent } from '@/lib/server/server-events';
import s from './page.module.css';

type Props = { params: Promise<{ token: string }> };

/**
 * Raport publiczny (PROMPT.md §11, docs/decisions.md p. 96): zawsze jasny, h1 to tytuł raportu, od 768 px
 * arkusz A4 jak /przyklad, na telefonie raport na całą szerokość. „Pobierz PDF” tworzy PDF w przeglądarce.
 * Link wygasły, odwołany albo nieprawidłowy → not-found.tsx z share.expired (bez żadnych danych).
 * Każde udane otwarcie zapisuje zdarzenie link_opened bez tokenu i bez właściciela (po wysłaniu strony).
 * Metadane są w layout.tsx (obejmują też not-found.tsx); odczyt jest wspólny przez React cache.
 */
export default async function SharedReportPage({ params }: Props) {
  const { token } = await params;
  const result = await getSharedReport(token);
  if (result.status === 'not-found') notFound();
  if (result.status === 'rate-limited') {
    return <SharedMessage heading={t.rateLimited.heading} detail={t.rateLimited.detail} />;
  }

  after(() => recordServerEvent('link_opened', {}));
  const logoSrc = result.hasLogo ? `/r/${token}/logo` : undefined;

  return (
    <div data-theme="light" className={s.page}>
      <ToastProvider>
        <main id="tresc" className={s.main}>
          <div className={s.toolbar}>
            <SharedPdfButton data={result.data} branding={result.branding} logoSrc={logoSrc} />
          </div>
          <section className={s.sheet} aria-label={t.reportLabel}>
            <Report data={result.data} headingLevel={1} logoSrc={logoSrc} />
          </section>
        </main>
      </ToastProvider>
    </div>
  );
}

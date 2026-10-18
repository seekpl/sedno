'use client';

import { SharedMessage } from '@/components/share/SharedMessage';
import { Button } from '@/components/ui/Button';
import { share as t } from '@/lib/copy/share';

/**
 * Błąd serwera przy odczycie raportu publicznego (np. baza nie odpowiada). Uczciwy komunikat zamiast
 * „raport niedostępny” — link może nadal działać. Bez szczegółów błędu na ekranie.
 */
export default function SharedReportError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <SharedMessage heading={t.failed.heading} detail={t.failed.detail}>
      <Button variant="primary" onClick={() => retry()}>
        {t.failed.retry}
      </Button>
    </SharedMessage>
  );
}

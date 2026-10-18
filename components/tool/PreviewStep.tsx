'use client';

import { useId } from 'react';
import { Report } from '@/components/report/Report';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { features } from '@/config/features';
import { tool } from '@/lib/copy/tool';
import { cx } from '@/lib/cx';
import type { ReportData } from '@/lib/report/types';
import { buttonSizes, StepHeader } from './parts';
import type { PdfStatus } from './state';
import s from './tool.module.css';

const t = tool.preview;

type PreviewStepProps = {
  headingId: string;
  report: ReportData;
  /** Nazwa klienta wpisana w kroku 2 (pusta = PDF niedostępny). */
  clientName: string;
  pdf: PdfStatus;
  isPhone: boolean;
  onDownload: () => void;
  onRequestClient: () => void;
  onBack: () => void;
};

/**
 * Krok 3 — Podgląd i PDF: raport tak, jak zobaczy go klient (zawsze jasny), i pobranie PDF w przeglądarce.
 * Bez nazwy klienta „Pobierz PDF” jest niedostępny (aria-disabled + wyjaśnienie), a kliknięcie prowadzi do pola.
 */
export function PreviewStep({
  headingId,
  report,
  clientName,
  pdf,
  isPhone,
  onDownload,
  onRequestClient,
  onBack,
}: PreviewStepProps) {
  const reasonId = useId();
  const sizes = buttonSizes(isPhone);
  const missingClient = clientName.trim() === '';

  return (
    <div className={s.preview}>
      <StepHeader id={headingId} caption={tool.stepCaption(3)} title={t.heading} />

      <div className={s.buttons}>
        <Button
          variant="primary"
          icon="download"
          size={sizes.main}
          block={isPhone}
          busy={pdf.status === 'busy'}
          unavailable={missingClient}
          aria-describedby={missingClient ? reasonId : undefined}
          onUnavailableClick={onRequestClient}
          onClick={onDownload}
        >
          {t.pdf}
        </Button>
        <Button size={sizes.main} block={isPhone} onClick={onBack}>
          {t.back}
        </Button>
      </div>
      {missingClient && (
        <p id={reasonId} className="sd-field__hint">
          {t.pdfUnavailable}
        </p>
      )}

      {pdf.status === 'done' && (
        <Alert variant="success" role="status" title={t.success.title(pdf.client)}>
          {t.success.body}
        </Alert>
      )}
      {pdf.status === 'error' && (
        <Alert variant="error" title={t.error.title}>
          {t.error.body}
        </Alert>
      )}

      {features.accounts ? (
        <p className={cx('body-s', s.soon)}>
          <span>{t.account.text}</span>
          {/* Zwykły <a>: /logowanie ma własną CSP z nonce z odpowiedzi na wczytanie dokumentu (p. 64). */}
          <a className={cx('sd-link', s.soonLink)} href={t.account.loginHref}>
            {t.account.login}
          </a>
        </p>
      ) : (
        <p className={cx('body-s', s.soon)}>
          <Badge>{t.soon.badge}</Badge>
          <span>{t.soon.text}</span>
        </p>
      )}

      <div className={s.sheet}>
        <Report data={report} headingLevel={2} />
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { track } from '@/lib/analytics/client';
import { share as t } from '@/lib/copy/share';
import { downloadReportPdf } from '@/lib/pdf/download';
import type { Branding, ReportData } from '@/lib/report/types';
import s from './SharedPdfButton.module.css';

type SharedPdfButtonProps = {
  data: ReportData;
  branding: Branding;
  /** /r/{token}/logo, gdy autor ma logo. */
  logoSrc?: string;
};

/**
 * „Pobierz PDF” na raporcie publicznym (PROMPT.md §11). PDF powstaje w przeglądarce (@react-pdf/renderer
 * ładowany dopiero po kliknięciu), wynik: toast „PDF pobrany” i zdarzenie pdf_downloaded. Błąd: Alert
 * z naprawą pod przyciskiem.
 */
export function SharedPdfButton({ data, branding, logoSrc }: SharedPdfButtonProps) {
  const toast = useToast();
  const [status, setStatus] = useState<'idle' | 'busy' | 'error'>('idle');

  const onDownload = async () => {
    if (status === 'busy') return;
    setStatus('busy');
    try {
      // Logo autora z tej samej domeny (/r/{token}/logo); bez niego PDF ma nazwę i inicjały autora.
      await downloadReportPdf(data, logoSrc ? { logoSrc } : undefined);
      setStatus('idle');
      toast({ message: t.pdf.downloaded });
      track('pdf_downloaded', { mode: 'account', branding });
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className={s.actions}>
      <Button icon="download" busy={status === 'busy'} onClick={() => void onDownload()} className={s.button}>
        {t.pdf.button}
      </Button>
      {status === 'error' && (
        <Alert variant="error" title={t.pdf.error.title} className={s.error}>
          {t.pdf.error.body}
        </Alert>
      )}
    </div>
  );
}

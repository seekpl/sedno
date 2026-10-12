'use client';

import { Button } from '@/components/ui/Button';
import { FileChip } from '@/components/ui/FileChip';
import { Progress } from '@/components/ui/Progress';
import { Skeleton } from '@/components/ui/Skeleton';
import { Upload } from '@/components/ui/Upload';
import { columnNames, csv } from '@/lib/copy/csv';
import { tool } from '@/lib/copy/tool';
import { cx } from '@/lib/cx';
import { formatFileSize, formatNumber } from '@/lib/i18n/pl';
import { buttonSizes, HowToLink, PrivacyLine, StepHeader } from './parts';
import type { ParseStatus, UploadError } from './state';
import s from './tool.module.css';

/** Pliki, które pokazuje okno wyboru. Ostateczną kontrolę robi parser (rozszerzenie i MIME). */
export const FILE_ACCEPT = '.csv,text/csv';

const t = tool.upload;

/** Przyczyna i naprawa dla błędu pliku (lib/copy/csv.ts). */
export function describeUploadError(error: UploadError): { title: string; body: string; mapping: boolean } {
  switch (error.code) {
    case 'E_NOT_CSV':
    case 'E_EMPTY':
      return { ...csv.errors[error.code], mapping: false };
    case 'E_TOO_BIG':
      return { ...csv.errors.E_TOO_BIG[error.reason], mapping: false };
    case 'E_MISSING_COLUMNS': {
      const field = error.missing[0] ?? 'views';
      return {
        title: csv.errors.E_MISSING_COLUMNS.title,
        body: csv.errors.E_MISSING_COLUMNS.body(columnNames[field]),
        mapping: true,
      };
    }
    case 'E_READ':
      return { ...t.failed, mapping: false };
  }
}

type UploadStepProps = {
  headingId: string;
  monthNom: string;
  file: { name: string; size: number } | null;
  parse: ParseStatus;
  isPhone: boolean;
  onFile: (file: File) => void;
  onOpenMapping: () => void;
};

/**
 * Krok 1 — Wgraj (EkranWgrywanie.html). Plik czyta wyłącznie przeglądarka: Upload oddaje go do onFile,
 * a przepływ parsuje go w Web Workerze. Linia prywatności jest widoczna w każdym stanie.
 */
export function UploadStep({
  headingId,
  monthNom,
  file,
  parse,
  isPhone,
  onFile,
  onOpenMapping,
}: UploadStepProps) {
  const sizes = buttonSizes(isPhone);
  const error = parse.status === 'error' ? describeUploadError(parse.error) : null;

  return (
    <div className={s.narrow}>
      <StepHeader id={headingId} caption={tool.stepCaption(1)} title={t.heading(monthNom)} />

      {parse.status === 'parsing' ? (
        <div className={cx('sd-card', s.parsing)}>
          {file && <FileChip name={file.name} size={formatFileSize(file.size)} />}
          <div className={s.skeletons}>
            <Skeleton width="40%" height={14} />
            <Skeleton width="30%" height={56} />
            <Skeleton width="60%" height={14} />
          </div>
          <div className={s.progress}>
            <p className="body-s" aria-live="polite">
              {parse.total > 0 ? t.progress(formatNumber(parse.done), formatNumber(parse.total)) : t.reading}
            </p>
            <Progress
              value={parse.total > 0 ? (parse.done / parse.total) * 100 : 0}
              label={t.progressLabel}
            />
          </div>
        </div>
      ) : (
        <Upload
          title={
            <>
              <span className={s.fineHint}>{t.title}</span>
              <span className={s.coarseHint}>{t.phoneTitle}</span>
            </>
          }
          hint={
            <>
              <span className={s.fineHint}>{t.hint}</span>
              <span className={s.coarseHint}>{t.phoneHint}</span>
            </>
          }
          overTitle={t.overTitle}
          overHint={t.overHint}
          buttonLabel={t.button}
          accept={FILE_ACCEPT}
          onFile={onFile}
          blockButton={isPhone}
          error={
            error
              ? {
                  title: error.title,
                  hint: error.body,
                  retryLabel: t.retry,
                  action: error.mapping ? (
                    <Button size={sizes.main} block={isPhone} onClick={onOpenMapping}>
                      {t.mapColumns}
                    </Button>
                  ) : undefined,
                }
              : undefined
          }
        />
      )}

      {/* Błąd pliku dla czytników ekranu: fokus jest na nagłówku, a obszar wgrywania nie ogłasza zmian. */}
      <p role="alert" className="sd-visually-hidden">
        {error ? `${error.title}. ${error.body}` : ''}
      </p>

      <PrivacyLine />
      <HowToLink />
    </div>
  );
}

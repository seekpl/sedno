'use client';

import type { ReactNode } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FileChip } from '@/components/ui/FileChip';
import { csv } from '@/lib/copy/csv';
import { tool } from '@/lib/copy/tool';
import { compareMonths } from '@/lib/dates';
import { formatDateRange, formatFileSize, monthForms, monthLabel, type MonthKey } from '@/lib/i18n/pl';
import { buttonSizes, HowToLink, PrivacyLine, StepHeader } from './parts';
import s from './tool.module.css';

/** Najwyżej trzy najnowsze miesiące z pliku (nie późniejsze niż bieżący), od najnowszego. */
export function monthsToOffer(months: readonly MonthKey[], current: MonthKey, max: MonthKey): MonthKey[] {
  return months
    .filter((m) => m !== current && compareMonths(m, max) <= 0)
    .slice(-3)
    .reverse();
}

type NoRowsStepProps = {
  headingId: string;
  month: MonthKey;
  maxMonth: MonthKey;
  file: { name: string; size: number } | null;
  months: readonly MonthKey[];
  range: { from: Date; to: Date };
  isPhone: boolean;
  /** Przełączenie na miesiąc z pliku. Bez niego (edytor z kontem: miesiąc z adresu) nie ma tych przycisków. */
  onMonth?: (month: MonthKey) => void;
  onPickFile: () => void;
  /** Nagłówek zamiast „Krok 1 z 3 / Wgraj eksport za …” (edytor z kontem). */
  header?: ReactNode;
  /** Dodatkowe działania w alercie (edytor z kontem: powrót do zapisanego raportu). */
  extraActions?: ReactNode;
};

/**
 * Plik wczytany, ale bez publikacji z wybranego miesiąca (E_NO_ROWS_IN_MONTH): przyczyna, zakres pliku
 * i naprawa jednym kliknięciem — przełączenie na miesiąc z pliku albo inny plik. Bez ponownego czytania pliku.
 */
export function NoRowsStep({
  headingId,
  month,
  maxMonth,
  file,
  months,
  range,
  isPhone,
  onMonth,
  onPickFile,
  header,
  extraActions,
}: NoRowsStepProps) {
  const sizes = buttonSizes(isPhone);
  const forms = monthForms(month);
  const errors = csv.errors.E_NO_ROWS_IN_MONTH;
  return (
    <div className={s.narrow}>
      {header ?? (
        <StepHeader id={headingId} caption={tool.stepCaption(1)} title={tool.upload.heading(forms.nom)} />
      )}
      {file && <FileChip name={file.name} size={formatFileSize(file.size)} />}
      <Alert
        variant="error"
        title={errors.title(forms.gen)}
        actions={
          <>
            {onMonth &&
              monthsToOffer(months, month, maxMonth).map((m) => (
                <Button key={m} size={sizes.small} block={isPhone} onClick={() => onMonth(m)}>
                  {tool.noRows.switchTo(monthLabel(m))}
                </Button>
              ))}
            <Button variant="ghost" size={sizes.small} block={isPhone} onClick={onPickFile}>
              {tool.upload.retry}
            </Button>
            {extraActions}
          </>
        }
      >
        {errors.body(formatDateRange(range.from, range.to))}
      </Alert>
      <PrivacyLine />
      <HowToLink />
    </div>
  );
}

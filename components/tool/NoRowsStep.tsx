'use client';

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
  onMonth: (month: MonthKey) => void;
  onPickFile: () => void;
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
}: NoRowsStepProps) {
  const sizes = buttonSizes(isPhone);
  const forms = monthForms(month);
  const errors = csv.errors.E_NO_ROWS_IN_MONTH;
  return (
    <div className={s.narrow}>
      <StepHeader id={headingId} caption={tool.stepCaption(1)} title={tool.upload.heading(forms.nom)} />
      {file && <FileChip name={file.name} size={formatFileSize(file.size)} />}
      <Alert
        variant="error"
        title={errors.title(forms.gen)}
        actions={
          <>
            {monthsToOffer(months, month, maxMonth).map((m) => (
              <Button key={m} size={sizes.small} block={isPhone} onClick={() => onMonth(m)}>
                {tool.noRows.switchTo(monthLabel(m))}
              </Button>
            ))}
            <Button variant="ghost" size={sizes.small} block={isPhone} onClick={onPickFile}>
              {tool.upload.retry}
            </Button>
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

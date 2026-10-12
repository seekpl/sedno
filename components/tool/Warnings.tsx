'use client';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { Warning } from '@/lib/csv/types';
import { csv } from '@/lib/copy/csv';
import { tool } from '@/lib/copy/tool';
import { cx } from '@/lib/cx';
import { addMonths, capitalize, formatDayMonth, monthForms, type MonthKey } from '@/lib/i18n/pl';
import { buttonSizes } from './parts';
import s from './tool.module.css';

const w = csv.warnings;

function dateParam(warning: Warning, key: string): Date {
  return new Date(String(warning.params?.[key] ?? ''));
}

function numberParam(warning: Warning, key: string): number {
  return Number(warning.params?.[key] ?? 0);
}

type WarningsProps = {
  warnings: readonly Warning[];
  month: MonthKey;
  noteId: string;
  /** Ostrzeżenie o niepełnym miesiącu zwinięte po „Zostaw przypis”. */
  incompleteCollapsed: boolean;
  isPhone: boolean;
  onUploadFull: () => void;
  onKeepNote: () => void;
};

/** Ostrzeżenia pliku i obliczeń jako Alert z ikoną i słowem; teksty z lib/copy/csv.ts. */
export function Warnings({
  warnings,
  month,
  noteId,
  incompleteCollapsed,
  isPhone,
  onUploadFull,
  onKeepNote,
}: WarningsProps) {
  const sizes = buttonSizes(isPhone);
  const forms = monthForms(month);
  const previous = monthForms(addMonths(month, -1));
  // Każdy kod raz, w stałej kolejności (parser: kodowanie; obliczenia: miesiąc i metryka).
  const seen = new Set<string>();
  const unique = warnings.filter((warning) => !seen.has(warning.code) && seen.add(warning.code));

  return unique.map((warning) => {
    switch (warning.code) {
      case 'W_INCOMPLETE_MONTH':
        if (incompleteCollapsed) {
          return (
            <p key={warning.code} id={noteId} tabIndex={-1} className={cx('body-s', s.noteLine)}>
              <Icon name="check" size="s" />
              {tool.effects.incomplete.kept}
            </p>
          );
        }
        return (
          <Alert
            key={warning.code}
            variant="warning"
            title={w.W_INCOMPLETE_MONTH.title(formatDayMonth(dateParam(warning, 'date')))}
            actions={
              <>
                <Button size={sizes.small} block={isPhone} onClick={onUploadFull}>
                  {tool.effects.incomplete.upload}
                </Button>
                <Button variant="ghost" size={sizes.small} block={isPhone} onClick={onKeepNote}>
                  {tool.effects.incomplete.keep}
                </Button>
              </>
            }
          >
            {w.W_INCOMPLETE_MONTH.body(
              previous.ins,
              numberParam(warning, 'days'),
              numberParam(warning, 'monthDays'),
            )}
          </Alert>
        );
      case 'W_MONTH_IN_PROGRESS':
        return (
          <Alert
            key={warning.code}
            variant="warning"
            title={w.W_MONTH_IN_PROGRESS.title(capitalize(forms.nom))}
          >
            {w.W_MONTH_IN_PROGRESS.body(formatDayMonth(dateParam(warning, 'date')))}
          </Alert>
        );
      case 'W_METRIC_CHANGE':
        return (
          <Alert key={warning.code} variant="info" title={w.W_METRIC_CHANGE.title}>
            {w.W_METRIC_CHANGE.body}
          </Alert>
        );
      case 'W_ENCODING_GUESSED':
        return (
          <Alert key={warning.code} variant="warning" title={w.W_ENCODING_GUESSED.title}>
            {w.W_ENCODING_GUESSED.body}
          </Alert>
        );
    }
  });
}

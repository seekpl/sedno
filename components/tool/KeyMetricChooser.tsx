'use client';

import { useId } from 'react';
import { Icon } from '@/components/ui/Icon';
import { buttonNames } from '@/lib/copy/report';
import { tool } from '@/lib/copy/tool';
import { cx } from '@/lib/cx';
import { formatNumber } from '@/lib/i18n/pl';
import { ACTION_ORDER } from '@/lib/report/format';
import type { KeyMetric, ReportData } from '@/lib/report/types';
import s from './tool.module.css';

const t = tool.effects.keyMetric;

type Option = { key: KeyMetric; name: string; value: number | null };

/**
 * Wybór kluczowej liczby (PROMPT.md §7, §10): grupa radio w fieldset z legendą, wygląd plakietek sd-badge
 * z ikoną circle-mark przy wybranej (EkranUzupelnij.html). Strzałki przesuwają wybór natywnie.
 * Liczba bez wartości jest niedostępna: aria-disabled i wyjaśnienie przez aria-describedby (nie disabled).
 */
export function KeyMetricChooser({
  report,
  fallback,
  onChange,
}: {
  report: ReportData;
  /** Wszystkie efekty to 0 albo brak danych, więc kluczowe są wyświetlenia (computeReport). */
  fallback: boolean;
  onChange: (key: KeyMetric) => void;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const actionReasonId = `${id}-action`;
  const viewsReasonId = `${id}-views`;
  const options: Option[] = [
    ...ACTION_ORDER.map((key) => ({ key, name: t.action(buttonNames[key]), value: report.actions[key] })),
    { key: 'views', name: t.views, value: report.summary.views },
  ];
  const actionUnavailable = options.some((o) => o.key !== 'views' && o.value == null);
  const viewsUnavailable = report.summary.views == null;

  return (
    <fieldset className={s.fieldset} aria-describedby={hintId}>
      <legend className="sd-field__label">{t.legend}</legend>
      <div className={s.options}>
        {options.map((option) => {
          const selected = report.keyMetric === option.key;
          const unavailable = option.value == null;
          return (
            <label key={option.key} className={cx(s.option, unavailable && s.optionUnavailable)}>
              <input
                type="radio"
                className="sd-visually-hidden"
                name={`${id}-key`}
                value={option.key}
                checked={selected}
                aria-disabled={unavailable || undefined}
                aria-describedby={
                  unavailable ? (option.key === 'views' ? viewsReasonId : actionReasonId) : undefined
                }
                onChange={() => {
                  if (!unavailable) onChange(option.key);
                }}
              />
              <span className={cx('sd-badge', selected && 'sd-badge--pen')}>
                {selected && <Icon name="circle-mark" />}
                {option.value == null ? option.name : t.withValue(option.name, formatNumber(option.value))}
              </span>
            </label>
          );
        })}
      </div>
      <span id={hintId} className="sd-field__hint">
        {t.hint}
      </span>
      {fallback && report.keyMetric === 'views' && (
        <span className={cx('sd-field__hint', s.hintIcon)}>
          <Icon name="info" size="s" />
          {/* Bez wyświetleń w pliku (np. eksport tylko z zasięgiem) nie ma czego zakreślić. */}
          {viewsUnavailable ? t.fallbackNoViews : t.fallback}
        </span>
      )}
      {actionUnavailable && (
        <span id={actionReasonId} className="sd-field__hint">
          {t.unavailableAction}
        </span>
      )}
      {viewsUnavailable && (
        <span id={viewsReasonId} className="sd-field__hint">
          {t.unavailableViews}
        </span>
      )}
    </fieldset>
  );
}

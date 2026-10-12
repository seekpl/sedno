'use client';

import { addMonths, monthLabel, monthLabelShort, type MonthKey } from '@/lib/i18n/pl';
import { Icon } from './Icon';
import styles from './MonthSwitcher.module.css';
import { copy } from '@/lib/copy/pl';

type MonthSwitcherProps = {
  month: MonthKey;
  onChange: (month: MonthKey) => void;
  /** Najpóźniejszy dostępny miesiąc (np. bieżący). */
  max?: MonthKey;
  min?: MonthKey;
};

/** Przełącznik miesiąca (sd-month). Na wąskim ekranie skrót „Wrz 2026”. */
export function MonthSwitcher({ month, onChange, max, min }: MonthSwitcherProps) {
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const prevBlocked = min !== undefined && prev < min;
  const nextBlocked = max !== undefined && next > max;
  return (
    <div className="sd-month" role="group" aria-label={copy.ui.month}>
      <button
        type="button"
        className={styles.button}
        aria-label={copy.ui.prevMonth}
        aria-disabled={prevBlocked || undefined}
        onClick={() => !prevBlocked && onChange(prev)}
      >
        <Icon name="chevron-left" size="s" />
      </button>
      <span aria-live="polite" className={styles.label}>
        <span className={styles.long}>{monthLabel(month)}</span>
        <span className={styles.short} aria-hidden="true">
          {monthLabelShort(month)}
        </span>
      </span>
      <button
        type="button"
        className={styles.button}
        aria-label={copy.ui.nextMonth}
        aria-disabled={nextBlocked || undefined}
        onClick={() => !nextBlocked && onChange(next)}
      >
        <Icon name="chevron-right" size="s" />
      </button>
    </div>
  );
}

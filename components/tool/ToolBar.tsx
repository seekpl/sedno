'use client';

import { AppNav } from '@/components/ui/AppNav';
import { MonthSwitcher } from '@/components/ui/MonthSwitcher';
import type { MonthKey } from '@/lib/i18n/pl';

/**
 * Pasek narzędzia (EkranWgrywanie.html): logo z linkiem do strony głównej i przełącznik miesiąca.
 * Na telefonie 56 px (AppNav). Bez nawigacji aplikacji — konta dojdą w Fazie 2.
 */
export function ToolBar({
  month,
  maxMonth,
  onMonthChange,
}: {
  month: MonthKey;
  maxMonth: MonthKey;
  onMonthChange: (month: MonthKey) => void;
}) {
  return <AppNav right={<MonthSwitcher month={month} max={maxMonth} onChange={onMonthChange} />} />;
}

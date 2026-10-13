'use client';

import { useRouter } from 'next/navigation';
import { MonthSwitcher } from '@/components/ui/MonthSwitcher';
import type { MonthKey } from '@/lib/i18n/pl';

/**
 * Przełącznik miesiąca sterujący adresem strony (PROMPT.md §10: miesiąc w pasku aplikacji, np. ?m=YYYY-MM).
 * hrefTemplate zawiera „:m” w miejscu miesiąca, np. „/app/klienci?m=:m” albo „/app/klienci/ID/:m”.
 */
export function MonthLinkSwitcher({
  month,
  max,
  min,
  hrefTemplate,
}: {
  month: MonthKey;
  max?: MonthKey;
  min?: MonthKey;
  hrefTemplate: string;
}) {
  const router = useRouter();
  return (
    <MonthSwitcher
      month={month}
      max={max}
      min={min}
      onChange={(next) => router.push(hrefTemplate.replace(':m', next))}
    />
  );
}

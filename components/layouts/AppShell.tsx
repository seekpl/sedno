'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppNav } from '@/components/ui/AppNav';
import { Badge } from '@/components/ui/Badge';
import { MonthSwitcher } from '@/components/ui/MonthSwitcher';
import { ToastProvider } from '@/components/ui/Toast';
import type { MonthKey } from '@/lib/i18n/pl';
import s from './AppShell.module.css';
import { copy } from '@/lib/copy/pl';

/**
 * Układ aplikacji (EkranPanel, EkranUzupelnij): pasek z nawigacją, przełącznik miesiąca w adresie (?m=YYYY-MM),
 * plakietka planu. Trasy /app powstają w Fazie 2.
 */
export function AppShell({
  month,
  maxMonth,
  plan,
  children,
}: {
  month: MonthKey;
  maxMonth: MonthKey;
  plan?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const goTo = (next: MonthKey) => {
    const query = new URLSearchParams(params.toString());
    query.set('m', next);
    router.push(`${pathname}?${query.toString()}`);
  };
  return (
    <ToastProvider>
      <AppNav
        homeHref="/app/klienci"
        items={copy.app.sections.map((item) => ({ ...item, current: pathname.startsWith(item.href) }))}
        right={<MonthSwitcher month={month} max={maxMonth} onChange={goTo} />}
        desktopExtras={plan && <Badge variant="plan">{plan}</Badge>}
      />
      <main className={s.main}>{children}</main>
    </ToastProvider>
  );
}

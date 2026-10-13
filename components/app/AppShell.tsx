import type { ReactNode } from 'react';
import { AppNav } from '@/components/ui/AppNav';
import { Badge } from '@/components/ui/Badge';
import { app, type AppSection } from '@/lib/copy/app';
import type { MonthKey } from '@/lib/i18n/pl';
import { MonthLinkSwitcher } from './MonthLinkSwitcher';
import s from './AppShell.module.css';

export type ShellMonth = { value: MonthKey; max?: MonthKey; min?: MonthKey; hrefTemplate: string };

/**
 * Powłoka ekranów konta (EkranPanel.html, EkranUzupelnij.html): pasek aplikacji z nawigacją (Klienci,
 * Raporty, Ustawienia) i — gdy ekran ma miesiąc — przełącznikiem miesiąca w adresie. Treść w <main>.
 */
export function AppShell({
  current,
  month,
  plan,
  children,
}: {
  current: AppSection | null;
  month?: ShellMonth;
  /** Nazwa planu w plakietce paska (od 768 px), np. „Na start”. */
  plan?: string;
  children: ReactNode;
}) {
  const items = app.nav.map((item) => ({
    href: item.href,
    label: item.label,
    current: item.key === current,
  }));
  return (
    <>
      <AppNav
        items={items}
        homeHref="/app/klienci"
        right={
          month ? (
            <MonthLinkSwitcher
              month={month.value}
              max={month.max}
              min={month.min}
              hrefTemplate={month.hrefTemplate}
            />
          ) : undefined
        }
        desktopExtras={plan ? <Badge variant="plan">{plan}</Badge> : undefined}
      />
      <main id="tresc" className={s.main} tabIndex={-1}>
        {children}
      </main>
    </>
  );
}

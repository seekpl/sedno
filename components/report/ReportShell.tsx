import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import s from './ReportShell.module.css';

/**
 * Kontener raportu dla klienta: zawsze jasny (data-theme="light"), w każdym motywie i na każdym urządzeniu
 * (PROMPT.md §2.3). Szerokość arkusza --report-sheet.
 */
export function ReportShell({
  children,
  variant = 'sheet',
  className,
}: {
  children: ReactNode;
  /** sheet = arkusz na stronie (link), phone = podgląd w ramce telefonu. */
  variant?: 'sheet' | 'phone';
  className?: string;
}) {
  return (
    <div
      data-theme="light"
      lang="pl"
      className={cx('sd-report', s.report, variant === 'phone' && s.phone, className)}
    >
      {children}
    </div>
  );
}

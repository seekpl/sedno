import type { AriaRole, ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from './Icon';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

const ICONS: Record<AlertVariant, IconName> = {
  info: 'info',
  success: 'check',
  warning: 'alert',
  error: 'error',
};

type AlertProps = {
  variant?: AlertVariant;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  /** Domyślnie błąd ma role="alert"; komunikat pojawiający się po działaniu może dostać role="status". */
  role?: AriaRole;
  className?: string;
};

/** Komunikat z ikoną i słowem (sd-alert). Błąd mówi przyczynę i naprawę. */
export function Alert({ variant = 'info', title, children, actions, role, className }: AlertProps) {
  return (
    <div
      className={cx('sd-alert', variant !== 'info' && `sd-alert--${variant}`, className)}
      role={role ?? (variant === 'error' ? 'alert' : undefined)}
    >
      <Icon name={ICONS[variant]} />
      <p className="sd-alert__title">{title}</p>
      {children && <p className="sd-alert__body">{children}</p>}
      {actions && <div className="sd-alert__actions">{actions}</div>}
    </div>
  );
}

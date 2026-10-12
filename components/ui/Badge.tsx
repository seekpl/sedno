import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from './Icon';
import { copy } from '@/lib/copy/pl';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'error' | 'pen' | 'plan';

type BadgeProps = {
  variant?: BadgeVariant;
  icon?: IconName;
  children: ReactNode;
  className?: string;
};

/** Plakietka (sd-badge). Statusy zawsze z ikoną i słowem — użyj StatusBadge. */
export function Badge({ variant = 'neutral', icon, children, className }: BadgeProps) {
  return (
    <span className={cx('sd-badge', variant !== 'neutral' && `sd-badge--${variant}`, className)}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

export type ReportStatus = 'draft' | 'ready' | 'sent' | 'no-export' | 'file-error';

/** Statusy raportu wg brand/reference/components/Badge.html. */
export const STATUS_BADGES: Record<ReportStatus, { variant: BadgeVariant; icon: IconName; label: string }> = {
  draft: { variant: 'neutral', icon: 'file', label: copy.ui.status.draft },
  ready: { variant: 'success', icon: 'check', label: copy.ui.status.ready },
  sent: { variant: 'pen', icon: 'link', label: copy.ui.status.sent },
  'no-export': { variant: 'warning', icon: 'alert', label: copy.ui.status.noExport },
  'file-error': { variant: 'error', icon: 'error', label: copy.ui.status.fileError },
};

export function StatusBadge({ status }: { status: ReportStatus }) {
  const { variant, icon, label } = STATUS_BADGES[status];
  return (
    <Badge variant={variant} icon={icon}>
      {label}
    </Badge>
  );
}

import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from './Icon';

type MetricProps = {
  icon?: IconName;
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  className?: string;
};

/** Liczba drugorzędna z etykietą i porównaniem (sd-metric). */
export function Metric({ icon, label, value, delta, className }: MetricProps) {
  return (
    <div className={cx('sd-metric', className)}>
      <span className="sd-metric__label">
        {icon && <Icon name={icon} size="s" />}
        {label}
      </span>
      <span className="sd-metric__value">{value}</span>
      {delta && <span className="sd-metric__delta">{delta}</span>}
    </div>
  );
}

import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Circled } from './Circled';
import { Icon, type IconName } from './Icon';

type KeyNumberProps = {
  icon?: IconName;
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  className?: string;
};

/** Kluczowa liczba z zakreśleniem (sd-key). */
export function KeyNumber({ icon, label, value, delta, className }: KeyNumberProps) {
  return (
    <div className={cx('sd-key', className)}>
      <span className="sd-key__label">
        {icon && <Icon name={icon} size="s" />} {label}
      </span>
      <span className="sd-key__value">
        <Circled>{value}</Circled>
      </span>
      {delta && <span className="sd-key__delta">{delta}</span>}
    </div>
  );
}

import { iconNodes, type IconName } from '@/lib/brand/svg.generated';
import { cx } from '@/lib/cx';
import { renderSvgNodes } from './SvgNodes';

export type { IconName };

type IconProps = {
  name: IconName;
  /** s = 16 px, m = 20 px, l = 24 px (klasy sd-icon--s / sd-icon--l). */
  size?: 's' | 'm' | 'l';
  /** Etykieta dla ikony bez tekstu obok. Bez etykiety ikona jest dekoracyjna (aria-hidden). */
  label?: string;
  className?: string;
};

export function Icon({ name, size = 'm', label, className }: IconProps) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const };
  return (
    <svg
      className={cx('sd-icon', size === 's' && 'sd-icon--s', size === 'l' && 'sd-icon--l', className)}
      viewBox="0 0 24 24"
      focusable="false"
      {...a11y}
    >
      {renderSvgNodes(iconNodes[name])}
    </svg>
  );
}

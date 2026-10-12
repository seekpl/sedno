import { cx } from '@/lib/cx';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';
export type ButtonSize = 's' | 'm' | 'l';

/** Klasy sd-btn dla wariantu i rozmiaru. Także dla linków renderowanych na serwerze (strona marketingowa). */
export function buttonClass({
  variant = 'default',
  size = 'm',
  block,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
}) {
  return cx(
    'sd-btn',
    variant !== 'default' && `sd-btn--${variant}`,
    size !== 'm' && `sd-btn--${size}`,
    block && 'sd-btn--block',
    className,
  );
}

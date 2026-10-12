import { logos, type LogoVariant } from '@/lib/brand/svg.generated';
import { renderSvgNodes } from './SvgNodes';
import { copy } from '@/lib/copy/pl';

type LogoProps = {
  variant?: LogoVariant;
  /**
   * Wysokość w px: pasek aplikacji 24, strona 28, stopka raportu 12–14 (brand/docs/3-logo.md).
   * Bez wartości wysokość ustala klasa (np. inna na telefonie).
   */
  height?: number;
  className?: string;
  /** Logo wewnątrz linku z własną etykietą: ukryj przed czytnikami, żeby nie dublować nazwy. */
  decorative?: boolean;
};

export function Logo({ variant = 'default', height, className, decorative }: LogoProps) {
  const logo = logos[variant];
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': copy.ui.logo };
  return (
    <svg
      className={className}
      style={height ? { height, width: 'auto', display: 'block' } : undefined}
      viewBox={logo.viewBox}
      xmlns="http://www.w3.org/2000/svg"
      focusable="false"
      {...a11y}
    >
      {renderSvgNodes(logo.nodes)}
    </svg>
  );
}

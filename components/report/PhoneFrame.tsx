import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import s from './PhoneFrame.module.css';

/**
 * Ramka telefonu z makiet (EkranRaport, EkranLanding, EkranUzupelnij): raport tak, jak zobaczy go klient.
 * `scale` jak `zoom` w makietach (np. 0.8 w hero strony głównej).
 */
export function PhoneFrame({
  children,
  scale,
  label,
  className,
}: {
  children: ReactNode;
  scale?: number;
  /** Opis dla czytników, np. „Przykładowy raport na telefonie”. */
  label?: string;
  className?: string;
}) {
  return (
    <figure
      className={cx(s.figure, className)}
      style={scale ? { zoom: scale } : undefined}
      aria-label={label}
    >
      <div className={s.phone}>{children}</div>
    </figure>
  );
}

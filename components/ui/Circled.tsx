import type { ReactNode } from 'react';
import { circledPath } from '@/lib/brand/svg.generated';

/** Pętla długopisu wokół jednej kluczowej liczby (sd-circled). Najwyżej jedna na widok. */
export function Circled({ children }: { children: ReactNode }) {
  return (
    <span className="sd-circled">
      {children}
      <svg className="sd-circled__ring" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d={circledPath} />
      </svg>
    </span>
  );
}

import type { ReactNode } from 'react';
import type { EventProps } from '@/lib/analytics/events';

/** Źródło wejścia do narzędzia — tylko wartości ze schematu zdarzenia landing_cta_click. */
export type ToolCta = EventProps<'landing_cta_click'>['cta'];

/** Adres narzędzia z parametrem src, z którego /nowy zapisuje zdarzenie landing_cta_click. */
export const toolHref = (src: ToolCta) => `/nowy?src=${src}`;

/**
 * Link do narzędzia /nowy. Celowo zwykły <a>, nie next/link: CSP przeglądarka bierze z odpowiedzi
 * na wczytanie dokumentu, a nawigacja po stronie klienta zostawiłaby na /nowy politykę strony marketingowej
 * — bez 'wasm-unsafe-eval' (PDF by nie powstał) i z szerszym connect-src (docs/decisions.md, p. 16 i 21).
 * Pełne wczytanie daje /nowy własną CSP z nonce z proxy.ts.
 */
export function ToolLink({
  src,
  className,
  children,
}: {
  src: ToolCta;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a className={className} href={toolHref(src)}>
      {children}
    </a>
  );
}

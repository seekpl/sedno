import type { ReactNode } from 'react';

/** Zakreślacz pod jednym zdaniem komentarza (sd-mark). Tylko tło, nigdy kolor tekstu. */
export function Mark({ children }: { children: ReactNode }) {
  return <mark className="sd-mark">{children}</mark>;
}

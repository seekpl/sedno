import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import s from './SharedMessage.module.css';

/** Dzieli tekst na pierwsze zdanie i resztę: „Ten raport … dostępny.” + „Poproś …”. */
export function splitFirstSentence(text: string): [string, string] {
  const match = /^(.+?[.?])\s+(.+)$/s.exec(text);
  return match?.[1] && match[2] ? [match[1], match[2]] : [text, ''];
}

type SharedMessageProps = {
  /** Pierwsze zdanie (duże). */
  heading: string;
  /** Wyjaśnienie i naprawa (mniejsze, w tym samym nagłówku — cały komunikat jest jednym tekstem). */
  detail?: string;
  children?: ReactNode;
};

/**
 * Komunikat zamiast raportu publicznego (wygasły link, limit, błąd serwera): zawsze jasny, bez danych
 * raportu i bez marki (autor może mieć plan bez stopki Sedno). Cały komunikat jest w jednym h1, więc jego
 * tekst jest dokładnie taki jak w lib/copy/share.ts (np. share.expired).
 */
export function SharedMessage({ heading, detail, children }: SharedMessageProps) {
  return (
    <div data-theme="light" className={s.page}>
      <main id="tresc" className={s.main}>
        <h1 className={s.title}>
          <span className={cx('heading-1', s.heading)}>{heading}</span>
          {detail ? ' ' : null}
          {detail ? <span className={cx('body-l', 'sd-secondary', s.detail)}>{detail}</span> : null}
        </h1>
        {children}
      </main>
    </div>
  );
}

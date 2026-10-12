'use client';

import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { RequiredField } from '@/lib/csv/types';
import { tool } from '@/lib/copy/tool';
import { cx } from '@/lib/cx';
import s from './tool.module.css';

/** Stałe identyfikatory elementów, na które przepływ przenosi fokus. */
export type FlowIds = {
  heading: string;
  client: string;
  headline: string;
  worked: string;
  markButton: string;
  note: string;
  mapping: (field: RequiredField) => string;
};

/** Rozmiar przycisków: na telefonie zawsze 48 px (cel dotyku), na komputerze jak w makietach. */
export function buttonSizes(isPhone: boolean) {
  return {
    main: isPhone ? ('l' as const) : ('m' as const),
    small: isPhone ? ('l' as const) : ('s' as const),
  };
}

/**
 * Nagłówek kroku: podpis „Krok 1 z 3” nad h1 (EkranWgrywanie.html). h1 ma tabIndex −1, bo po zmianie kroku
 * przepływ przenosi na niego fokus.
 */
export function StepHeader({ id, caption, title }: { id: string; caption?: string; title: ReactNode }) {
  return (
    <header className={s.header}>
      {caption && <span className="caption sd-muted">{caption}</span>}
      <h1 id={id} tabIndex={-1} className={cx('heading-2', s.title)}>
        {title}
      </h1>
    </header>
  );
}

/** Lista kroków nad formularzem (EkranUzupelnij.html): zrobione — ikona i słowo, bieżący — pióro. */
export function StepList({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className={s.steps} aria-label={tool.steps.label}>
      {tool.steps.items.map((label, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <li
            key={label}
            className={cx('sd-badge', done && 'sd-badge--success', active && 'sd-badge--pen')}
            aria-current={active ? 'step' : undefined}
          >
            {done && <Icon name="check" />}
            {label}
          </li>
        );
      })}
    </ol>
  );
}

/** Linia prywatności — zawsze widoczna przy wgrywaniu (PROMPT.md §10). */
export function PrivacyLine() {
  return (
    <p className="sd-privacy">
      <Icon name="lock" size="s" />
      {tool.privacy}
    </p>
  );
}

/** Link do poradnika w nowej karcie, z informacją dla czytników ekranu. */
export function HowToLink({
  href = tool.upload.howToHref,
  children = tool.upload.howTo,
}: {
  href?: string;
  children?: string;
}) {
  return (
    <a className={cx('sd-link', s.howTo)} href={href} target="_blank" rel="noopener">
      {children} <span className="sd-visually-hidden">{tool.upload.newTab}</span>
    </a>
  );
}

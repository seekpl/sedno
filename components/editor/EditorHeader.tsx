'use client';

import Link from 'next/link';
import { StepList } from '@/components/tool/parts';
import toolStyles from '@/components/tool/tool.module.css';
import { editor as t } from '@/lib/copy/editor';
import { cx } from '@/lib/cx';
import { monthForms, type MonthKey } from '@/lib/i18n/pl';
import { clientsHref } from './model';
import s from './editor.module.css';

/**
 * Nagłówek edytora (EkranUzupelnij.html): link „Klienci” do listy za ten miesiąc, h1 „Raport: {klient},
 * {miesiąc}” i lista kroków. h1 ma tabIndex −1, bo po zmianie kroku edytor przenosi na niego fokus.
 */
export function EditorHeader({
  id,
  clientName,
  month,
  step,
}: {
  id: string;
  clientName: string;
  month: MonthKey;
  step: 1 | 2 | 3;
}) {
  return (
    <header className={s.header}>
      <div className={s.titleBlock}>
        <Link className={cx('sd-link', s.back)} href={clientsHref(month)}>
          {t.back.label}
          <span className="sd-visually-hidden">{t.back.hint(month)}</span>
        </Link>
        <h1 id={id} tabIndex={-1} className={cx('heading-2', toolStyles.title)}>
          {t.heading(clientName, monthForms(month).nom)}
        </h1>
      </div>
      <StepList current={step} items={t.steps(step)} />
    </header>
  );
}

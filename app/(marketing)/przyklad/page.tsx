import type { Metadata } from 'next';
import { Report } from '@/components/report/Report';
import { ExampleNote } from '@/components/site/ExampleNote';
import { pageMetadata } from '@/components/site/seo';
import { ToolLink } from '@/components/site/ToolLink';
import { buttonClass } from '@/components/ui/buttonClass';
import { copy } from '@/lib/copy/pl';
import { cx } from '@/lib/cx';
import { EXAMPLE_REPORT } from '@/lib/report/example';
import s from './page.module.css';

const t = copy.landing.example;

export const metadata: Metadata = pageMetadata({
  path: '/przyklad',
  title: t.title,
  description: copy.landing.seo.example.description,
});

/**
 * Przykładowy raport (PROMPT.md §10, brand/reference/screens/EkranRaport.html) na danych przykładowych,
 * zawsze z oznaczeniem (zasada 6). Od 768 px arkusz A4, na telefonie raport na całą szerokość.
 * Bez przycisku PDF: strona jest statyczna, PDF powstaje w /nowy (wejście przez ToolLink, z własną CSP).
 */
export default function ExamplePage() {
  return (
    <div className={s.page}>
      <header className={s.head}>
        <ExampleNote />
        <h1 className={cx('display-l', s.title)}>{t.title}</h1>
        <p className={cx('body-l', 'sd-secondary', s.lead)}>{t.lead}</p>
      </header>
      <section className={s.sheet} aria-label={t.reportLabel}>
        <Report data={EXAMPLE_REPORT} headingLevel={2} />
      </section>
      <div className={s.cta}>
        <ToolLink className={buttonClass({ variant: 'primary', size: 'l' })} src="example">
          {t.cta}
        </ToolLink>
      </div>
    </div>
  );
}

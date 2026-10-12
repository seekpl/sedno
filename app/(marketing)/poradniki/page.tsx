import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/components/site/seo';
import { Badge } from '@/components/ui/Badge';
import { copy } from '@/lib/copy/pl';
import { cx } from '@/lib/cx';
import { GUIDES, PLANNED_GUIDES } from '@/content/poradniki';
import s from './page.module.css';

const t = copy.landing.guides;

export const metadata: Metadata = pageMetadata({
  path: '/poradniki',
  title: t.title,
  description: copy.landing.seo.guides.description,
});

/** Lista poradników (PROMPT.md §12): szkic artykułu i tytuły planowane — te bez stron i bez linków. */
export default function GuidesPage() {
  return (
    <div className={s.page}>
      <header className={s.head}>
        <h1 className={cx('display-l', s.title)}>{t.title}</h1>
        <p className="body-l sd-secondary">{t.lead}</p>
      </header>
      <ul className={s.list}>
        {GUIDES.map((guide) => (
          <li key={guide.slug} className={cx('sd-card', s.card)}>
            {guide.status === 'draft' && <Badge icon="file">{t.draft}</Badge>}
            <h2 className="heading-3">
              <Link className="sd-link" href={`/poradniki/${guide.slug}`}>
                {guide.title}
              </Link>
            </h2>
            <p className="sd-secondary">{guide.description}</p>
          </li>
        ))}
      </ul>
      <section className={s.planned} aria-labelledby="planowane">
        <h2 id="planowane" className="heading-2">
          {t.planned}
        </h2>
        <p className="sd-secondary">{t.plannedLead}</p>
        <ul className={s.plannedList}>
          {PLANNED_GUIDES.map((title) => (
            <li key={title}>{title}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

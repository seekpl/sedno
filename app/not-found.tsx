import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import { buttonClass } from '@/components/ui/buttonClass';
import { copy } from '@/lib/copy/pl';
import { cx } from '@/lib/cx';
import s from './not-found.module.css';

const t = copy.landing.notFound;

// Next.js sam dodaje noindex do odpowiedzi 404.
export const metadata: Metadata = { title: t.title };

/** Strona 404 po polsku, zawsze jasna (jak strona marketingowa). */
export default function NotFound() {
  return (
    <div data-theme="light" className={s.site}>
      <SiteHeader />
      <main id="tresc" className={s.main}>
        <h1 className={cx('display-l', s.title)}>{t.title}</h1>
        <p className="body-l sd-secondary">{t.body}</p>
        <Link className={buttonClass({ variant: 'primary', size: 'l', className: s.home })} href="/">
          {t.home}
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/components/site/seo';
import { Alert } from '@/components/ui/Alert';
import { buttonClass } from '@/components/ui/buttonClass';
import { settings } from '@/lib/copy/settings';
import { cx } from '@/lib/cx';
import s from './page.module.css';

const t = settings.deleteAccount.done;

// Strona po „Usuń konto” (app/app/ustawienia/actions.ts): bez indeksowania i poza sitemap.
export const metadata: Metadata = pageMetadata({ path: '/konto-usuniete', title: t.title, index: false });

/**
 * Wynik usunięcia konta: statyczna strona bez JavaScriptu, wynik słowem i ikoną (Alert sukcesu). Link do /nowy jako zwykły
 * <a> (CSP z nonce na /nowy, decyzja 64).
 */
export default function AccountDeletedPage() {
  return (
    <article className={s.page}>
      <h1 className={cx('display-l', s.title)}>{t.title}</h1>
      <Alert variant="success" title={t.body}>
        {t.links}
      </Alert>
      <p className="body-l sd-secondary">{t.again}</p>
      <div className={s.actions}>
        <a className={buttonClass({ variant: 'primary', size: 'l' })} href="/nowy">
          {t.cta}
        </a>
        <Link className={buttonClass({ size: 'l' })} href="/">
          {t.home}
        </Link>
      </div>
    </article>
  );
}

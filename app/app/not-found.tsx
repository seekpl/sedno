import Link from 'next/link';
import { AppShell } from '@/components/app/AppShell';
import { buttonClass } from '@/components/ui/buttonClass';
import { app as t } from '@/lib/copy/app';
import s from './error.module.css';

/**
 * Brak zasobu w obszarze konta (notFound() z edytora albo strony konta): cudzy klient wygląda tak samo jak
 * nieistniejący (RLS), bez nazwy klienta. Pasek aplikacji zostaje, link prowadzi do listy klientów.
 */
export default function AccountNotFound() {
  return (
    <AppShell current={null}>
      <div className={s.wrap}>
        <h1 className="heading-2">{t.notFound.heading}</h1>
        <p className="body-l sd-secondary">{t.notFound.body}</p>
        <p>
          <Link className={buttonClass({ variant: 'primary' })} href="/app/klienci">
            {t.notFound.back}
          </Link>
        </p>
      </div>
    </AppShell>
  );
}

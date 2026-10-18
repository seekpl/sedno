import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LoginPanel } from '@/components/auth/LoginPanel';
import { Logo } from '@/components/ui/Logo';
import { features } from '@/config/features';
import { safeNextPath } from '@/lib/auth/next-path';
import { auth as t } from '@/lib/copy/auth';
import { common } from '@/lib/copy/common';
import s from './page.module.css';

export const metadata: Metadata = {
  title: t.meta.title,
  description: t.meta.description,
  robots: { index: false, follow: true },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Logowanie linkiem z e-maila (PROMPT.md §10). Tylko z flagą kont (docs/decisions.md, p. 94). Strona
 * dynamiczna (CSP z nonce z proxy.ts); zalogowanego proxy.ts odsyła do panelu. ?next= (tylko ścieżki /app,
 * safeNextPath) przechodzi przez ukryte pole do linku w e-mailu; ?blad=link pokazuje, że link nie zadziałał.
 */
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  if (!features.accounts) notFound();
  const params = await searchParams;
  const next = safeNextPath(first(params.next));
  const linkError = first(params.blad) === 'link';

  return (
    <div data-theme="light" className={s.page}>
      <header className={s.header}>
        <Link href="/" className={s.home} aria-label={common.nav.home}>
          <Logo className={s.logo} decorative />
        </Link>
      </header>
      <main id="tresc" className={s.main}>
        <LoginPanel next={next} linkError={linkError} />
      </main>
    </div>
  );
}

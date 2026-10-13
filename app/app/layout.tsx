import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ToastProvider } from '@/components/ui/Toast';
import { features } from '@/config/features';
import { requireUser } from '@/lib/auth/session';
import s from './layout.module.css';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Obszar konta (/app): tylko z włączoną flagą kont (docs/decisions.md, p. 94) i tylko dla zalogowanych
 * (proxy.ts przekierowuje wcześniej; tu druga warstwa). Zawsze jasny motyw jak makiety.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  if (!features.accounts) notFound();
  await requireUser();
  return (
    <div data-theme="light" className={s.app}>
      <ToastProvider>{children}</ToastProvider>
    </div>
  );
}

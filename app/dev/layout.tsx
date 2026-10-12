import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ToastProvider } from '@/components/ui/Toast';

export const metadata: Metadata = {
  title: 'Komponenty',
  robots: { index: false, follow: false },
};

/** Strona deweloperska — tylko poza produkcją (PROMPT.md §13). */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return <ToastProvider>{children}</ToastProvider>;
}

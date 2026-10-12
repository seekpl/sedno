import type { Metadata } from 'next';
import { connection } from 'next/server';
import { NewReportFlow } from '@/components/tool/NewReportFlow';
import { tool } from '@/lib/copy/tool';
import { currentMonth, lastFullMonth } from '@/lib/dates';

export const metadata: Metadata = {
  title: tool.meta.title,
  description: tool.meta.description,
};

/**
 * Narzędzie bez konta (PROMPT.md §10): 1. Wgraj → 2. Efekty → 3. Podgląd i PDF, wszystko w przeglądarce.
 * Renderowanie dynamiczne: strona dostaje nonce CSP z proxy.ts (docs/decisions.md, p. 16), a domyślny
 * miesiąc (ostatni pełny) liczymy przy każdym wejściu, nie w chwili budowania.
 */
export default async function NewReportPage() {
  await connection();
  const now = new Date();
  return <NewReportFlow initialMonth={lastFullMonth(now)} maxMonth={currentMonth(now)} />;
}

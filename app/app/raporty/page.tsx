import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app/AppShell';
import { HistoryLoadError, HistoryView } from '@/components/app/history/HistoryView';
import { HISTORY_PATH, historyHref, parsePageParam } from '@/components/app/history/model';
import { PLANS } from '@/config/pricing';
import { history } from '@/lib/copy/history';
import { listReports, type HistoryPage } from '@/lib/data/history';
import { getPlan, type Plan } from '@/lib/data/profile';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = parsePageParam((await searchParams).strona);
  return { title: page && page > 1 ? history.meta.titlePage(page) : history.meta.title };
}

/**
 * Historia raportów /app/raporty?strona=N (PROMPT.md §10, paginacja po 20). ?strona= poza 1…ostatnia albo
 * niepoprawne → przekierowanie na właściwy adres. Dane z sesji użytkownika (RLS). Logowanie i flagę kont
 * sprawdza app/app/layout.tsx.
 */
export default async function HistoryPageRoute({ searchParams }: Props) {
  const requested = parsePageParam((await searchParams).strona);
  if (requested === null) redirect(HISTORY_PATH);

  let data: { page: HistoryPage; plan: Plan } | null = null;
  try {
    const db = await createSupabaseServerClient();
    const [page, plan] = await Promise.all([listReports(db, requested), getPlan(db)]);
    data = { page, plan };
  } catch {
    // Bez treści błędu bazy i bez danych raportów w logu.
    console.error('[sedno] Historia raportów: nie udało się wczytać danych.');
  }

  if (data && data.page.page !== requested) redirect(historyHref(data.page.page));

  return (
    <AppShell current="raporty" plan={data ? PLANS[data.plan].name : undefined}>
      {data ? <HistoryView data={data.page} /> : <HistoryLoadError page={requested} />}
    </AppShell>
  );
}

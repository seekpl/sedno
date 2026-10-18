import type { Metadata } from 'next';
import { unstable_rethrow } from 'next/navigation';
import { AppShell } from '@/components/app/AppShell';
import { MIN_PANEL_MONTH, planLabel, resolvePanelMonth } from '@/components/app/panel/model';
import { PanelLoadError, PanelView } from '@/components/app/panel/PanelView';
import { requireUser } from '@/lib/auth/session';
import { panel } from '@/lib/copy/panel';
import { currentPlan, monthOverview, type MonthOverview, type Plan } from '@/lib/data/panel';
import { currentMonth } from '@/lib/dates';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { m } = await searchParams;
  return { title: panel.meta.title(resolvePanelMonth(m, new Date())) };
}

/**
 * Panel klientów na miesiąc /app/klienci?m=YYYY-MM (PROMPT.md §10, EkranPanel.html). Domyślnie ostatni
 * pełny miesiąc, najpóźniej bieżący. Dane z sesji użytkownika (RLS): klienci, raporty za M i M−1, plan.
 * Flagę kont sprawdza app/app/layout.tsx; sesję także strona (układ nie renderuje się ponownie przy
 * nawigacji między stronami /app), jak edytor.
 */
export default async function ClientsPage({ searchParams }: Props) {
  const { m } = await searchParams;
  const now = new Date();
  const month = resolvePanelMonth(m, now);
  await requireUser(`/app/klienci?m=${month}`);

  let data: { overview: MonthOverview; plan: Plan } | null = null;
  try {
    const db = await createSupabaseServerClient();
    const [overview, plan] = await Promise.all([monthOverview(db, month), currentPlan(db)]);
    data = { overview, plan };
  } catch (error) {
    // Wewnętrzne wyjątki Next.js (przekierowanie, 404, przejście na renderowanie dynamiczne) idą dalej.
    unstable_rethrow(error);
    // Bez treści błędu bazy i bez danych klientów w logu.
    console.error('[sedno] Panel klientów: nie udało się wczytać danych.');
  }

  return (
    <AppShell
      current="klienci"
      month={{
        value: month,
        max: currentMonth(now),
        min: MIN_PANEL_MONTH,
        hrefTemplate: '/app/klienci?m=:m',
      }}
      plan={data ? planLabel(data.plan) : undefined}
    >
      {data ? (
        <PanelView month={month} now={now} overview={data.overview} />
      ) : (
        <PanelLoadError month={month} href={`/app/klienci?m=${month}`} />
      )}
    </AppShell>
  );
}

import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';
import { MIN_PANEL_MONTH, planLabel, resolvePanelMonth } from '@/components/app/panel/model';
import { PanelLoadError, PanelView } from '@/components/app/panel/PanelView';
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
 * Logowanie i flagę kont sprawdza app/app/layout.tsx.
 */
export default async function ClientsPage({ searchParams }: Props) {
  const { m } = await searchParams;
  const now = new Date();
  const month = resolvePanelMonth(m, now);

  let data: { overview: MonthOverview; plan: Plan } | null = null;
  try {
    const db = await createSupabaseServerClient();
    const [overview, plan] = await Promise.all([monthOverview(db, month), currentPlan(db)]);
    data = { overview, plan };
  } catch {
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

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { AppShell } from '@/components/app/AppShell';
import { planLabel } from '@/components/app/panel/model';
import { EditorLoadError } from '@/components/editor/EditorLoadError';
import { initialStep, MIN_EDITOR_MONTH, validEditorParams } from '@/components/editor/model';
import { ReportEditor } from '@/components/editor/ReportEditor';
import type { LinkView, SavedSnapshot } from '@/components/editor/types';
import { siteUrl } from '@/components/site/seo';
import { requireUser } from '@/lib/auth/session';
import { editor } from '@/lib/copy/editor';
import { getActiveLink } from '@/lib/data/links';
import { currentPlan, type Plan } from '@/lib/data/panel';
import {
  getClient,
  getPreviousReport,
  getReport,
  getReportAuthor,
  type EditorClient,
  type ReportAuthor,
} from '@/lib/data/reports';
import { currentMonth } from '@/lib/dates';
import { shareUrl } from '@/lib/links/token';
import type { HistoryInput } from '@/lib/report/compute';
import { historyFromReport } from '@/lib/report/edits';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  createLinkAction,
  markSentAction,
  revokeLinkAction,
  saveReportAction,
  undoSentAction,
} from './actions';

type Props = {
  params: Promise<{ id: string; miesiac: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Klient z sesji użytkownika (RLS) — wspólny dla metadanych i strony w jednym żądaniu. */
const loadClient = cache(async (id: string): Promise<EditorClient | null> => {
  const db = await createSupabaseServerClient();
  return getClient(db, id);
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, miesiac } = await params;
  if (!validEditorParams(id, miesiac, currentMonth(new Date()))) return { title: editor.meta.fallback };
  try {
    const client = await loadClient(id);
    return { title: client ? editor.meta.title(client.name, miesiac) : editor.meta.fallback };
  } catch {
    return { title: editor.meta.fallback };
  }
}

type EditorData = {
  client: EditorClient;
  author: ReportAuthor;
  saved: SavedSnapshot | null;
  history: HistoryInput | null;
  link: LinkView | null;
  plan: Plan;
};

/**
 * Edytor raportu klienta za miesiąc /app/klienci/{id}/{YYYY-MM} (PROMPT.md §10, EkranUzupelnij.html).
 * Zły identyfikator, miesiąc spoza zakresu (najpóźniej bieżący) albo cudzy klient → 404. Dane z sesji
 * użytkownika (RLS): klient, autor z profilu, zapisany raport, raport za M−1 (historia), aktywny link, plan.
 * Przełącznik miesiąca prowadzi do raportu tego samego klienta za inny miesiąc. ?krok=1|2|3 wybiera krok.
 */
export default async function ReportEditorPage({ params, searchParams }: Props) {
  const [{ id, miesiac }, { krok }] = await Promise.all([params, searchParams]);
  const maxMonth = currentMonth(new Date());
  if (!validEditorParams(id, miesiac, maxMonth)) notFound();
  await requireUser(`/app/klienci/${id}/${miesiac}`);

  let data: EditorData | null = null;
  try {
    const client = await loadClient(id);
    if (client) {
      const db = await createSupabaseServerClient();
      const [author, report, previous, plan] = await Promise.all([
        getReportAuthor(db),
        getReport(db, id, miesiac),
        getPreviousReport(db, id, miesiac),
        currentPlan(db),
      ]);
      const active = report ? await getActiveLink(db, report.id) : null;
      data = {
        client,
        author,
        saved: report ? { data: report.data, status: report.status, sentAt: report.sentAt } : null,
        // Do przeglądarki tylko liczby z raportu za M−1 (bez typów publikacji i najlepszych treści).
        history: previous ? historyFromReport(previous.data) : null,
        link: active
          ? {
              token: active.token,
              url: shareUrl(active.token, siteUrl()),
              expiresAt: active.expiresAt,
              views: active.views,
            }
          : null,
        plan,
      };
    }
  } catch {
    // Bez treści błędu bazy i bez danych klienta w logu.
    console.error('[sedno] Edytor raportu: nie udało się wczytać danych.');
    return (
      <AppShell current="klienci">
        <EditorLoadError href={`/app/klienci/${id}/${miesiac}`} />
      </AppShell>
    );
  }
  if (!data) notFound();

  return (
    <AppShell
      current="klienci"
      month={{
        value: miesiac,
        max: maxMonth,
        min: MIN_EDITOR_MONTH,
        hrefTemplate: `/app/klienci/${id}/:m`,
      }}
      plan={planLabel(data.plan)}
    >
      <ReportEditor
        // Inny klient albo miesiąc to nowy edytor (stan z reduktora nie przechodzi między raportami).
        key={`${id}/${miesiac}`}
        client={{ id: data.client.id, name: data.client.name }}
        month={miesiac}
        author={data.author}
        saved={data.saved}
        history={data.history}
        link={data.link}
        initialStep={initialStep(krok, data.saved !== null)}
        actions={{
          save: saveReportAction,
          createLink: createLinkAction,
          revokeLink: revokeLinkAction,
          markSent: markSentAction,
          undoSent: undoSentAction,
        }}
      />
    </AppShell>
  );
}

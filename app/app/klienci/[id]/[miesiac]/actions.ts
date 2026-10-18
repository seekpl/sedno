'use server';

/**
 * Działania edytora raportu z kontem (PROMPT.md §8, §10, §15): zapis szkicu i „do wysyłki”, link do raportu
 * (utwórz, wyłącz), oznaczenie wysłania i cofnięcie.
 *
 * - Tylko zalogowany użytkownik i tylko z włączonymi kontami; własność pilnuje RLS (cudzy identyfikator
 *   po prostu nic nie znajduje → „nie ma takiego raportu”).
 * - zod na wejściu każdej akcji: identyfikator klienta (uuid), miesiąc 'YYYY-MM' nie późniejszy niż bieżący,
 *   ReportData ścisłym schematem (bez wierszy pliku i opisów — zasada 1), token 22 znaki base62.
 * - Limit: 20 nowych linków na 10 minut na konto.
 * - Wyniki są małe i w kształcie interfejsu; akcje nie rzucają wyjątków i nie zwracają treści błędów bazy.
 *   Nie logujemy treści raportów, tokenów ani adresów e-mail.
 */
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { MIN_EDITOR_MONTH } from '@/components/editor/model';
import type { LinkResult, RevokeResult, SaveResult, StatusResult } from '@/components/editor/types';
import { siteUrl } from '@/components/site/seo';
import { features } from '@/config/features';
import { getCurrentUser } from '@/lib/auth/session';
import { editor as t } from '@/lib/copy/editor';
import { compareMonths, currentMonth } from '@/lib/dates';
import {
  createLink,
  LINKS_PER_REPORT_MAX,
  LinkQuotaError,
  LinkReportNotFoundError,
  revokeLink,
} from '@/lib/data/links';
import {
  getReport,
  markSent,
  MONTH_PATTERN,
  monthSchema,
  ReportNotFoundError,
  saveReport,
  undoSent,
} from '@/lib/data/reports';
import { shareUrl, TOKEN_PATTERN } from '@/lib/links/token';
import { reportDataSchema } from '@/lib/report/types';
import { rateLimit } from '@/lib/server/rate-limit';
import { recordServerEvent } from '@/lib/server/server-events';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { z } from '@/lib/zod';

const LINK_LIMIT = 20;
const LINK_WINDOW_MS = 10 * 60_000;

/**
 * Miesiąc raportu: 'YYYY-MM' od MIN_EDITOR_MONTH (jak adres edytora i zakres kolumny `period` w bazie)
 * do bieżącego (raportu z przyszłości nie ma).
 */
const reportMonth = monthSchema.refine(
  // Zod sprawdza refine także po nieudanym wzorcu: compareMonths tylko dla poprawnego 'YYYY-MM'.
  (month) =>
    MONTH_PATTERN.test(month) &&
    compareMonths(month, MIN_EDITOR_MONTH) >= 0 &&
    compareMonths(month, currentMonth(new Date())) <= 0,
);

const refSchema = z.object({ clientId: z.uuid(), month: reportMonth }).strict();
const saveSchema = z
  .object({
    clientId: z.uuid(),
    month: reportMonth,
    data: reportDataSchema,
    intent: z.enum(['draft', 'ready']),
  })
  .strict();
const tokenSchema = z.object({ token: z.string().regex(TOKEN_PATTERN) }).strict();

const fail = (error: string) => ({ ok: false as const, error });

/** Zalogowany użytkownik albo null (wygasła sesja, konta wyłączone). */
async function currentUser() {
  if (!features.accounts) return null;
  return getCurrentUser();
}

/** Odświeżenie list (panel klientów, historia) po zmianie raportu. */
function refreshLists() {
  revalidatePath('/app/klienci');
  revalidatePath('/app/raporty');
}

export async function saveReportAction(input: unknown): Promise<SaveResult> {
  try {
    const user = await currentUser();
    if (!user) return fail(t.errors.session);
    const parsed = saveSchema.safeParse(input);
    if (!parsed.success || parsed.data.data.period !== parsed.data.month) return fail(t.errors.invalid);
    const { clientId, month, data, intent } = parsed.data;

    const db = await createSupabaseServerClient();
    const saved = await saveReport(db, { clientId, period: month, data, intent });
    refreshLists();
    return { ok: true, report: { data: saved.data, status: saved.status, sentAt: saved.sentAt } };
  } catch (error) {
    if (error instanceof ReportNotFoundError) return fail(t.errors.notFound);
    if (error instanceof z.ZodError) return fail(t.errors.invalid);
    console.error('[sedno] Zapis raportu nie powiódł się.');
    return fail(t.errors.failed);
  }
}

export async function createLinkAction(input: unknown): Promise<LinkResult> {
  try {
    const user = await currentUser();
    if (!user) return fail(t.errors.session);
    const parsed = refSchema.safeParse(input);
    if (!parsed.success) return fail(t.errors.invalid);
    if (!rateLimit(`links:create:${user.id}`, LINK_LIMIT, LINK_WINDOW_MS)) return fail(t.errors.rateLimited);

    const db = await createSupabaseServerClient();
    // Link tylko do zapisanego raportu (RLS: własnego).
    const report = await getReport(db, parsed.data.clientId, parsed.data.month);
    if (!report) return fail(t.errors.notFound);
    const link = await createLink(db, report.id);
    // Zdarzenie bez tokenu i bez treści, po wysłaniu odpowiedzi.
    after(() => recordServerEvent('link_created', {}, user.id));
    revalidatePath('/app/raporty');
    return {
      ok: true,
      link: {
        token: link.token,
        url: shareUrl(link.token, siteUrl()),
        expiresAt: link.expiresAt,
        views: link.views,
      },
    };
  } catch (error) {
    if (error instanceof LinkReportNotFoundError) return fail(t.errors.notFound);
    if (error instanceof LinkQuotaError) return fail(t.errors.linkQuota(LINKS_PER_REPORT_MAX));
    console.error('[sedno] Utworzenie linku nie powiodło się.');
    return fail(t.errors.failed);
  }
}

export async function revokeLinkAction(input: unknown): Promise<RevokeResult> {
  try {
    const user = await currentUser();
    if (!user) return fail(t.errors.session);
    const parsed = tokenSchema.safeParse(input);
    if (!parsed.success) return fail(t.errors.invalid);

    const db = await createSupabaseServerClient();
    const result = await revokeLink(db, parsed.data.token);
    if (result === 'not-found') return fail(t.errors.notFound);
    revalidatePath('/app/raporty');
    return { ok: true };
  } catch {
    console.error('[sedno] Wyłączenie linku nie powiodło się.');
    return fail(t.errors.failed);
  }
}

async function changeStatus(
  input: unknown,
  change: typeof markSent | typeof undoSent,
): Promise<StatusResult> {
  try {
    const user = await currentUser();
    if (!user) return fail(t.errors.session);
    const parsed = refSchema.safeParse(input);
    if (!parsed.success) return fail(t.errors.invalid);

    const db = await createSupabaseServerClient();
    const state = await change(db, parsed.data.clientId, parsed.data.month);
    if (!state) return fail(t.errors.notFound);
    refreshLists();
    return { ok: true, report: state };
  } catch {
    console.error('[sedno] Zmiana statusu raportu nie powiodła się.');
    return fail(t.errors.failed);
  }
}

export async function markSentAction(input: unknown): Promise<StatusResult> {
  return changeStatus(input, markSent);
}

export async function undoSentAction(input: unknown): Promise<StatusResult> {
  return changeStatus(input, undoSent);
}

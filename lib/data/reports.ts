import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addMonths, type MonthKey } from '@/lib/i18n/pl';
import { stripEmoji } from '@/lib/report/compute';
import { reportDataSchema, type ReportData } from '@/lib/report/types';
import type { Database, Enums, Json } from '@/lib/supabase/database.types';
import { z } from '@/lib/zod';

/**
 * Raporty w edytorze /app/klienci/{id}/{YYYY-MM} (PROMPT.md §8, §10). Pierwszy parametr to klient Supabase:
 * w aplikacji sesja użytkownika (RLS — cudzy identyfikator po prostu nic nie znajduje), w testach bazy klient
 * testowego użytkownika. Klucza serwisowego tu nie używamy. Treści raportów ani błędów bazy nie logujemy.
 *
 * Status: „Zapisz szkic” zostawia status bez zmian (nowy raport to szkic), „Przejdź do wysyłki” zmienia szkic
 * na „Gotowy”; wysłany raport po edycji zostaje wysłany, bo link zawsze pokazuje najnowsze dane.
 */
type Db = SupabaseClient<Database>;

export type ReportStatus = Enums<'report_status_t'>;
export type SaveIntent = 'draft' | 'ready';

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
export const monthSchema = z.string().regex(MONTH_PATTERN);

export type SavedReport = {
  id: string;
  clientId: string;
  month: MonthKey;
  status: ReportStatus;
  data: ReportData;
  sentAt: string | null;
  updatedAt: string;
};

export type ReportState = { status: ReportStatus; sentAt: string | null };

export type EditorClient = { id: string; name: string; archived: boolean };

/** Autor na raporcie: marka, a bez niej nazwa z profilu; logo, gdy jest w Ustawieniach. */
export type ReportAuthor = { name: string; hasLogo: boolean };

/** Błąd odczytu lub zapisu bez treści błędu bazy (ta nie trafia do interfejsu ani logów). */
export class ReportsDataError extends Error {
  constructor(readonly step: 'client' | 'profile' | 'report' | 'save' | 'status') {
    super(`Raporty: operacja „${step}” nie powiodła się.`);
    this.name = 'ReportsDataError';
  }
}

/** Klient albo raport nie istnieje albo należy do innego konta (RLS). */
export class ReportNotFoundError extends Error {
  constructor() {
    super('Raporty: nie ma takiego klienta albo raportu.');
    this.name = 'ReportNotFoundError';
  }
}

/** Pierwszy dzień miesiąca w formacie kolumny `reports.period`. */
export const periodOf = (month: MonthKey) => `${month}-01`;

const uuid = z.uuid();
const isUuid = (value: string) => uuid.safeParse(value).success;

const REPORT_COLUMNS = 'id, client_id, period, status, data, sent_at, updated_at';

type ReportRow = {
  id: string;
  client_id: string;
  period: string;
  status: ReportStatus;
  data: Json;
  sent_at: string | null;
  updated_at: string;
};

/** Wiersz z bazy → raport edytora. Dane w innym kształcie (np. starsza wersja) to brak zapisu, nie błąd. */
function toSaved(row: ReportRow): SavedReport | null {
  const parsed = reportDataSchema.safeParse(row.data);
  if (!parsed.success) {
    console.error('[sedno] Zapisany raport nie pasuje do schematu ReportData.');
    return null;
  }
  return {
    id: row.id,
    clientId: row.client_id,
    month: row.period.slice(0, 7),
    status: row.status,
    data: parsed.data,
    sentAt: row.sent_at,
    updatedAt: row.updated_at,
  };
}

/** Klient zalogowanego użytkownika albo null (zły identyfikator, cudzy klient, brak klienta). */
export async function getClient(db: Db, clientId: string): Promise<EditorClient | null> {
  if (!isUuid(clientId)) return null;
  const { data, error } = await db
    .from('clients')
    .select('id, name, archived_at')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw new ReportsDataError('client');
  return data ? { id: data.id, name: data.name, archived: data.archived_at !== null } : null;
}

/** Najdłuższa nazwa autora w ReportData (reportDataSchema: author.name ≤ 80 jednostek UTF-16). */
const AUTHOR_NAME_MAX = 80;

/**
 * Tekst przycięty do `max` jednostek UTF-16 bez rozcinania par zastępczych. Baza liczy znaki (punkty
 * kodowe), schemat raportu — jednostki UTF-16, więc nazwa z 80 znaków spoza BMP bywa dłuższa niż 80.
 * Samotna połówka pary nie przeszłaby do kolumny jsonb i każdy zapis raportu kończyłby się błędem.
 */
export function truncateUnits(text: string, max: number): string {
  if (text.length <= max) return text;
  let out = '';
  for (const char of text) {
    if (out.length + char.length > max) break;
    out += char;
  }
  return out.trimEnd();
}

/** Nazwa z profilu tak, jak trafi do raportu: bez emoji (kroje marki ich nie mają), najwyżej 80 jednostek. */
const authorText = (value: string | null | undefined) =>
  truncateUnits(stripEmoji(value ?? '').trim(), AUTHOR_NAME_MAX);

/**
 * Autor raportu z profilu: marka, a bez niej imię i nazwisko (pierwsza niepusta po usunięciu emoji). Bez
 * profilu albo nazwy: pusta nazwa — raport zaczyna się wtedy od „dla: {klient}”.
 */
export async function getReportAuthor(db: Db): Promise<ReportAuthor> {
  const { data, error } = await db
    .from('profiles')
    .select('display_name, brand_name, logo_path')
    .maybeSingle();
  if (error) throw new ReportsDataError('profile');
  const name = authorText(data?.brand_name) || authorText(data?.display_name);
  return { name, hasLogo: data?.logo_path != null };
}

/** Zapisany raport klienta za miesiąc albo null. */
export async function getReport(db: Db, clientId: string, month: MonthKey): Promise<SavedReport | null> {
  if (!isUuid(clientId) || !MONTH_PATTERN.test(month)) return null;
  const { data, error } = await db
    .from('reports')
    .select(REPORT_COLUMNS)
    .eq('client_id', clientId)
    .eq('period', periodOf(month))
    .maybeSingle();
  if (error) throw new ReportsDataError('report');
  return data ? toSaved(data) : null;
}

/** Zapisany raport tego samego klienta za miesiąc wcześniej (historia M−1) albo null. */
export async function getPreviousReport(
  db: Db,
  clientId: string,
  month: MonthKey,
): Promise<SavedReport | null> {
  if (!MONTH_PATTERN.test(month)) return null;
  return getReport(db, clientId, addMonths(month, -1));
}

/** Status po zapisie: szkic zostaje szkicem, „do wysyłki” robi z niego „Gotowy”, wysłany zostaje wysłany. */
export function nextStatus(current: ReportStatus | null, intent: SaveIntent): ReportStatus {
  if (intent === 'ready') return current === 'sent' ? 'sent' : 'ready';
  return current ?? 'draft';
}

export const saveReportInputSchema = z
  .object({
    clientId: z.uuid(),
    period: monthSchema,
    data: reportDataSchema,
    intent: z.enum(['draft', 'ready']),
  })
  .strict()
  .refine((input) => input.data.period === input.period, { path: ['data', 'period'] });

export type SaveReportInput = z.input<typeof saveReportInputSchema>;

/** Najdłuższa nazwa klienta w ReportData (reportDataSchema: client.name ≤ 80 jednostek UTF-16). */
const CLIENT_NAME_MAX = 80;

/** Tekst bez emoji jak w raporcie; gdyby zostało puste, zostaje oryginał (nazwy z bazy mają ≥ 1 znak). */
function clean(name: string): string {
  return stripEmoji(name).trim() || name.trim();
}

/**
 * Zapis raportu (wstawienie albo zmiana dla pary klient–miesiąc). Nazwę klienta, autora i branding ustawia
 * serwer z bazy (w Fazie 2 zawsze stopka Sedno; logo pokazuje trasa /app/logo, nie adres w danych).
 * Rzuca ZodError przy złych danych, ReportNotFoundError dla cudzego lub nieistniejącego klienta.
 */
export async function saveReport(db: Db, input: SaveReportInput): Promise<SavedReport> {
  const { clientId, period, data, intent } = saveReportInputSchema.parse(input);
  const [client, author, existing] = await Promise.all([
    getClient(db, clientId),
    getReportAuthor(db),
    db
      .from('reports')
      .select('id, status')
      .eq('client_id', clientId)
      .eq('period', periodOf(period))
      .maybeSingle(),
  ]);
  if (!client) throw new ReportNotFoundError();
  if (existing.error) throw new ReportsDataError('report');

  const normalized = reportDataSchema.parse({
    ...data,
    client: { name: truncateUnits(clean(client.name), CLIENT_NAME_MAX) },
    author: { name: author.name },
    branding: 'sedno-footer',
  });
  const json = normalized as unknown as Json;

  const update = async (id: string, current: ReportStatus) => {
    const { data: row, error } = await db
      .from('reports')
      .update({ data: json, status: nextStatus(current, intent) })
      .eq('id', id)
      .select(REPORT_COLUMNS)
      .single();
    if (error || !row) throw new ReportsDataError('save');
    return row;
  };

  let row: ReportRow;
  if (existing.data) {
    row = await update(existing.data.id, existing.data.status);
  } else {
    const inserted = await db
      .from('reports')
      .insert({ client_id: clientId, period: periodOf(period), data: json, status: nextStatus(null, intent) })
      .select(REPORT_COLUMNS)
      .single();
    if (inserted.error?.code === '23505') {
      // Równoległy zapis (np. druga karta) wstawił raport chwilę wcześniej: zmieniamy go zamiast wstawiać.
      const again = await db
        .from('reports')
        .select('id, status')
        .eq('client_id', clientId)
        .eq('period', periodOf(period))
        .maybeSingle();
      if (again.error || !again.data) throw new ReportsDataError('save');
      row = await update(again.data.id, again.data.status);
    } else if (inserted.error || !inserted.data) {
      throw new ReportsDataError('save');
    } else {
      row = inserted.data;
    }
  }

  const saved = toSaved(row);
  if (!saved) throw new ReportsDataError('save');
  return saved;
}

async function currentState(db: Db, clientId: string, month: MonthKey): Promise<ReportState | null> {
  const { data, error } = await db
    .from('reports')
    .select('status, sent_at')
    .eq('client_id', clientId)
    .eq('period', periodOf(month))
    .maybeSingle();
  if (error) throw new ReportsDataError('status');
  return data ? { status: data.status, sentAt: data.sent_at } : null;
}

/**
 * „Oznacz jako wysłany”: status „Wysłany” i chwila wysłania. Już wysłany raport zostaje bez zmian
 * (data pierwszego wysłania). Null, gdy raportu nie ma (albo jest cudzy).
 */
export async function markSent(
  db: Db,
  clientId: string,
  month: MonthKey,
  now: Date = new Date(),
): Promise<ReportState | null> {
  if (!isUuid(clientId) || !MONTH_PATTERN.test(month)) return null;
  const { data, error } = await db
    .from('reports')
    .update({ status: 'sent', sent_at: now.toISOString() })
    .eq('client_id', clientId)
    .eq('period', periodOf(month))
    .neq('status', 'sent')
    .select('status, sent_at')
    .maybeSingle();
  if (error) throw new ReportsDataError('status');
  return data ? { status: data.status, sentAt: data.sent_at } : currentState(db, clientId, month);
}

/** „Cofnij” po wysłaniu: wysłany raport wraca do „Gotowy”. Inne statusy bez zmian. Null, gdy raportu nie ma. */
export async function undoSent(db: Db, clientId: string, month: MonthKey): Promise<ReportState | null> {
  if (!isUuid(clientId) || !MONTH_PATTERN.test(month)) return null;
  const { data, error } = await db
    .from('reports')
    .update({ status: 'ready', sent_at: null })
    .eq('client_id', clientId)
    .eq('period', periodOf(month))
    .eq('status', 'sent')
    .select('status, sent_at')
    .maybeSingle();
  if (error) throw new ReportsDataError('status');
  return data ? { status: data.status, sentAt: data.sent_at } : currentState(db, clientId, month);
}

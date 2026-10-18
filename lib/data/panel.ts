import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { panel as t } from '@/lib/copy/panel';
import { addMonths, type MonthKey } from '@/lib/i18n/pl';
import { stripEmoji } from '@/lib/report/compute';
import { reportDataSchema } from '@/lib/report/types';
import type { Database, Enums } from '@/lib/supabase/database.types';
import { z } from '@/lib/zod';

/**
 * Dane panelu klientów /app/klienci (PROMPT.md §10 „Panel”). Pierwszy parametr to klient Supabase:
 * w aplikacji sesja użytkownika (RLS — widać tylko własne wiersze), w testach bazy klient testowego
 * użytkownika. Klucza serwisowego tu nie używamy.
 */
type Db = SupabaseClient<Database>;

/** Status w panelu: status zapisanego raportu albo „Brak eksportu”, gdy raportu za miesiąc nie ma. */
export type PanelStatus = 'sent' | 'ready' | 'draft' | 'no-export';

export type PanelRow = {
  id: string;
  name: string;
  status: PanelStatus;
  /** Liczby z raportu za miesiąc; brak raportu albo danych to null („—”), nigdy 0. */
  book: number | null;
  call: number | null;
  views: number | null;
};

export type MonthOverview = {
  /** Aktywni (niezarchiwizowani) klienci w kolejności dodania. */
  rows: PanelRow[];
  sentCount: number;
  total: number;
  /** Suma kliknięć „Zarezerwuj” z raportów za miesiąc; null, gdy żaden raport jej nie ma. */
  bookSum: number | null;
  /** To samo dla miesiąca poprzedniego. */
  bookSumPrevious: number | null;
};

export type Industry = Enums<'industry_t'>;
export type Plan = Enums<'plan_t'>;

/** Błąd odczytu lub zapisu bez treści błędu bazy (ta nie trafia do interfejsu ani logów). */
export class PanelDataError extends Error {
  constructor(readonly step: 'clients' | 'reports' | 'profile' | 'insert') {
    super(`Panel klientów: operacja „${step}” nie powiodła się.`);
    this.name = 'PanelDataError';
  }
}

const INDUSTRIES = [
  'salon',
  'restauracja',
  'gabinet',
  'sklep',
  'inne',
] as const satisfies readonly Industry[];

/** Pierwszy dzień miesiąca w formacie kolumny `reports.period`. */
export const periodOf = (month: MonthKey) => `${month}-01`;

/**
 * Nazwa klienta: NFC, bez emoji (kroje marki ich nie mają, raport i tak je usuwa — docs/decisions.md, p. 42),
 * bez znaków sterujących, białe znaki zwinięte do jednej spacji. Po oczyszczeniu 1–80 znaków.
 */
const clientName = z
  .string({ error: t.add.errors.nameRequired })
  .transform((value) =>
    stripEmoji(value.normalize('NFC'))
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
  .pipe(z.string().min(1, { error: t.add.errors.nameRequired }).max(80, { error: t.add.errors.nameTooLong }));

/**
 * Dane nowego klienta. Tylko nazwa i branża — `included_in_free`, właściciel i daty ustawia baza
 * (trigger i wartości domyślne; użytkownik nie ma do tych kolumn uprawnień). Nieznane pola są pomijane.
 */
export const clientInputSchema = z.object({
  name: clientName,
  industry: z.enum(INDUSTRIES, { error: t.add.errors.industryInvalid }).default('inne'),
});

export type ClientInput = z.input<typeof clientInputSchema>;

/** Dodaje klienta zalogowanemu użytkownikowi. Rzuca ZodError przy złych danych, PanelDataError przy błędzie bazy. */
export async function createClient(db: Db, input: ClientInput): Promise<{ id: string; name: string }> {
  const { name, industry } = clientInputSchema.parse(input);
  const { data, error } = await db.from('clients').insert({ name, industry }).select('id, name').single();
  if (error || !data) throw new PanelDataError('insert');
  return data;
}

/** Plan z profilu (plakietka w pasku aplikacji). Bez profilu — plan darmowy. */
export async function currentPlan(db: Db): Promise<Plan> {
  const { data, error } = await db.from('profiles').select('plan').maybeSingle();
  if (error) throw new PanelDataError('profile');
  return data?.plan ?? 'free';
}

type ReportNumbers = Pick<PanelRow, 'book' | 'call' | 'views'>;

const NO_NUMBERS: ReportNumbers = { book: null, call: null, views: null };

/** Liczby z zapisanego ReportData; dane w innym kształcie (np. starsza wersja) to brak danych, nie 0. */
function reportNumbers(data: unknown): ReportNumbers {
  const parsed = reportDataSchema.safeParse(data);
  if (!parsed.success) return NO_NUMBERS;
  return {
    book: parsed.data.actions.book,
    call: parsed.data.actions.call,
    views: parsed.data.summary.views,
  };
}

function sum(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v != null);
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}

/**
 * Panel na miesiąc: aktywni klienci (bez zarchiwizowanych, w kolejności dodania) ze statusem i liczbami
 * raportu za `month` oraz sumy kliknięć „Zarezerwuj” za `month` i miesiąc wcześniejszy. Dwa zapytania:
 * klienci i raporty z obu miesięcy. Raporty zarchiwizowanych klientów nie wchodzą do sum.
 */
export async function monthOverview(db: Db, month: MonthKey): Promise<MonthOverview> {
  const current = periodOf(month);
  const previous = periodOf(addMonths(month, -1));
  const [clients, reports] = await Promise.all([
    db
      .from('clients')
      .select('id, name')
      .is('archived_at', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
    db.from('reports').select('client_id, period, status, data').in('period', [current, previous]),
  ]);
  if (clients.error || !clients.data) throw new PanelDataError('clients');
  if (reports.error || !reports.data) throw new PanelDataError('reports');

  const byClient = new Map<string, { status: Enums<'report_status_t'>; numbers: ReportNumbers }>();
  const previousBook = new Map<string, number | null>();
  for (const report of reports.data) {
    const numbers = reportNumbers(report.data);
    if (report.period === current) byClient.set(report.client_id, { status: report.status, numbers });
    else previousBook.set(report.client_id, numbers.book);
  }

  const rows: PanelRow[] = clients.data.map((client) => {
    const report = byClient.get(client.id);
    return {
      id: client.id,
      name: client.name,
      status: report ? report.status : 'no-export',
      ...(report ? report.numbers : NO_NUMBERS),
    };
  });

  return {
    rows,
    sentCount: rows.filter((row) => row.status === 'sent').length,
    total: rows.length,
    bookSum: sum(rows.map((row) => row.book)),
    bookSumPrevious: sum(clients.data.map((client) => previousBook.get(client.id) ?? null)),
  };
}

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MonthKey } from '@/lib/i18n/pl';
import type { Database, Enums } from '@/lib/supabase/database.types';

/**
 * Historia raportów /app/raporty (PROMPT.md §10 „Historia raportów (paginacja po 20)”). Pierwszy parametr
 * to klient Supabase z sesją użytkownika (RLS — tylko własne raporty) albo klient testowego użytkownika.
 * Jedno zapytanie na stronę: raporty z nazwą klienta i linkami, z dokładną liczbą wszystkich raportów.
 */
type Db = SupabaseClient<Database>;

export const HISTORY_PAGE_SIZE = 20;

/** Stan linku do raportu: aktywny, wyłączony (odwołany), wygasły albo brak linku. */
export type LinkState = 'active' | 'revoked' | 'expired' | 'none';

export type HistoryRow = {
  id: string;
  clientId: string;
  clientName: string;
  month: MonthKey;
  status: Enums<'report_status_t'>;
  sentAt: string | null;
  link: LinkState;
};

export type HistoryPage = {
  rows: HistoryRow[];
  /** Liczba wszystkich raportów właściciela. */
  total: number;
  /** Strona faktycznie pokazana (1…pageCount); różna od żądanej, gdy ta była poza zakresem. */
  page: number;
  /** Liczba stron, co najmniej 1. */
  pageCount: number;
};

/** Błąd odczytu bez treści błędu bazy (ta nie trafia do interfejsu ani logów). */
export class HistoryDataError extends Error {
  constructor() {
    super('Historia raportów: odczyt nie powiódł się.');
    this.name = 'HistoryDataError';
  }
}

type LinkRow = { created_at: string; expires_at: string; revoked_at: string | null };

/**
 * Stan linku raportu z wszystkich jego linków: jest aktywny (nieodwołany i nieprzeterminowany) → „Aktywny”;
 * inaczej stan najnowszego linku (odwołany → „Wyłączony”, przeterminowany → „Wygasł”); bez linków → brak.
 */
export function linkState(links: readonly LinkRow[], now: Date): LinkState {
  const at = now.getTime();
  const isActive = (l: LinkRow) => l.revoked_at == null && Date.parse(l.expires_at) > at;
  if (links.some(isActive)) return 'active';
  const latest = [...links].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  if (!latest) return 'none';
  return latest.revoked_at != null ? 'revoked' : 'expired';
}

export const pageCountOf = (total: number) => Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));

const SELECT =
  'id, client_id, period, status, sent_at, clients(name), share_links(created_at, expires_at, revoked_at)';

async function fetchPage(db: Db, page: number) {
  const from = (page - 1) * HISTORY_PAGE_SIZE;
  return db
    .from('reports')
    .select(SELECT, { count: 'exact' })
    .order('period', { ascending: false })
    .order('clients(name)', { ascending: true })
    .order('id', { ascending: true })
    .range(from, from + HISTORY_PAGE_SIZE - 1);
}

/** Liczba wszystkich raportów właściciela (bez pobierania wierszy). */
async function countReports(db: Db): Promise<number> {
  const { count, error } = await db.from('reports').select('id', { count: 'exact', head: true });
  if (error) throw new HistoryDataError();
  return count ?? 0;
}

type FetchedRow = {
  id: string;
  client_id: string;
  period: string;
  status: Enums<'report_status_t'>;
  sent_at: string | null;
  clients: { name: string } | { name: string }[] | null;
  share_links: LinkRow[] | null;
};

function toRow(row: FetchedRow, now: Date): HistoryRow {
  const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: client?.name ?? '',
    month: row.period.slice(0, 7),
    status: row.status,
    sentAt: row.sent_at,
    link: linkState(row.share_links ?? [], now),
  };
}

/**
 * Strona historii: raporty od najnowszego miesiąca, w miesiącu alfabetycznie po kliencie, po 20.
 * Strona spoza zakresu (np. ?strona=99) → ostatnia strona (pole `page` mówi, która). Od drugiej strony
 * najpierw liczymy raporty, żeby nie prosić o zakres poza wierszami (PostgREST odpowiada wtedy 416).
 */
export async function listReports(db: Db, page: number, now: Date = new Date()): Promise<HistoryPage> {
  const requested = Number.isInteger(page) && page >= 1 ? page : 1;
  const shown = requested === 1 ? 1 : Math.min(requested, pageCountOf(await countReports(db)));
  const { data, count, error } = await fetchPage(db, shown);
  if (error || !data) throw new HistoryDataError();

  const total = count ?? data.length;
  return {
    rows: (data as FetchedRow[]).map((row) => toRow(row, now)),
    total,
    page: Math.min(shown, pageCountOf(total)),
    pageCount: pageCountOf(total),
  };
}

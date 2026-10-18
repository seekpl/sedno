import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MonthKey } from '@/lib/i18n/pl';
import type { Database, Enums } from '@/lib/supabase/database.types';

/**
 * Historia raportów /app/raporty (PROMPT.md §10 „Historia raportów (paginacja po 20)”). Pierwszy parametr
 * to klient Supabase z sesją użytkownika (RLS — tylko własne raporty) albo klient testowego użytkownika.
 * Kolejność ustalamy w aplikacji (polski porządek nazw klientów), szczegóły pobieramy tylko dla 20 raportów
 * z pokazywanej strony.
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

/** Klucz kolejności raportu: miesiąc, nazwa klienta, identyfikator (rozstrzyga remisy). */
export type HistoryKey = { id: string; period: string; clientName: string };

/**
 * Polski porządek alfabetyczny (a, ą, b, c, ć … ł … ś … ź, ż; wielkość liter bez znaczenia przed
 * rozstrzygnięciem remisu). Baza porównuje bajty (C.UTF-8), więc „Łąka”, „Żabka” albo „bistro” trafiałyby
 * za „Zeta” — dlatego sortujemy tutaj, nie w zapytaniu.
 */
const collator = new Intl.Collator('pl', { numeric: true });

/** Kolejność historii: miesiąc malejąco, w miesiącu klient alfabetycznie (po polsku), potem id. */
export function compareHistoryKeys(a: HistoryKey, b: HistoryKey): number {
  if (a.period !== b.period) return a.period < b.period ? 1 : -1;
  const byName = collator.compare(a.clientName, b.clientName);
  if (byName !== 0) return byName;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Ile kluczy prosimy jednym zapytaniem (supabase/config.toml: max_rows = 1000). */
const KEYS_PAGE = 1000;

type Embedded = { name: string } | { name: string }[] | null;

const clientNameOf = (clients: Embedded) => (Array.isArray(clients) ? clients[0] : clients)?.name ?? '';

/**
 * Klucze kolejności wszystkich raportów właściciela (kilkadziesiąt bajtów na raport). Pierwsza porcja
 * liczy wiersze (przy przesunięciu 0 PostgREST nie odpowiada 416), kolejne zaczynają się tam, gdzie
 * skończyła poprzednia — także gdy serwer oddaje mniej wierszy, niż prosimy.
 */
async function fetchKeys(db: Db): Promise<HistoryKey[]> {
  const page = (from: number, count: boolean) =>
    db
      .from('reports')
      .select('id, period, clients(name)', count ? { count: 'exact' } : undefined)
      .order('id', { ascending: true })
      .range(from, from + KEYS_PAGE - 1);

  const first = await page(0, true);
  if (first.error || !first.data) throw new HistoryDataError();
  const rows = [...(first.data as { id: string; period: string; clients: Embedded }[])];
  const total = first.count ?? (rows.length < KEYS_PAGE ? rows.length : Infinity);
  while (rows.length < total) {
    const next = await page(rows.length, false);
    if (next.error || !next.data) throw new HistoryDataError();
    // Raporty usunięte w trakcie odczytu: koniec listy przed policzoną liczbą.
    if (next.data.length === 0) break;
    rows.push(...(next.data as typeof rows));
  }
  return rows.map((row) => ({ id: row.id, period: row.period, clientName: clientNameOf(row.clients) }));
}

const SELECT =
  'id, client_id, period, status, sent_at, clients(name), share_links(created_at, expires_at, revoked_at)';

type FetchedRow = {
  id: string;
  client_id: string;
  period: string;
  status: Enums<'report_status_t'>;
  sent_at: string | null;
  clients: Embedded;
  share_links: LinkRow[] | null;
};

function toRow(row: FetchedRow, now: Date): HistoryRow {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: clientNameOf(row.clients),
    month: row.period.slice(0, 7),
    status: row.status,
    sentAt: row.sent_at,
    link: linkState(row.share_links ?? [], now),
  };
}

/**
 * Strona historii: raporty od najnowszego miesiąca, w miesiącu alfabetycznie po kliencie (po polsku), po 20,
 * z dokładną liczbą wszystkich raportów. Strona spoza zakresu (np. ?strona=99) → ostatnia strona (pole
 * `page` mówi, która). Dwa zapytania: klucze kolejności wszystkich raportów, potem szczegóły (klient, status,
 * linki) tylko 20 raportów z tej strony. Liczymy tylko przy przesunięciu 0: zakres poza wierszami
 * z liczeniem PostgREST odrzuca (416), bez liczenia zwraca pustą listę.
 */
export async function listReports(db: Db, page: number, now: Date = new Date()): Promise<HistoryPage> {
  const requested = Number.isInteger(page) && page >= 1 ? page : 1;
  const keys = (await fetchKeys(db)).sort(compareHistoryKeys);
  const total = keys.length;
  const pageCount = pageCountOf(total);
  const shown = Math.min(requested, pageCount);
  const ids = keys.slice((shown - 1) * HISTORY_PAGE_SIZE, shown * HISTORY_PAGE_SIZE).map((key) => key.id);
  if (ids.length === 0) return { rows: [], total, page: shown, pageCount };

  const { data, error } = await db.from('reports').select(SELECT).in('id', ids);
  if (error || !data) throw new HistoryDataError();
  const byId = new Map((data as FetchedRow[]).map((row) => [row.id, row]));
  // Kolejność z kluczy; raport usunięty między zapytaniami po prostu znika ze strony.
  const rows = ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [toRow(row, now)] : [];
  });
  return { rows, total, page: shown, pageCount };
}

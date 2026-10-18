/**
 * Czyste funkcje historii raportów (bez Reacta i bez bazy): numer strony z adresu, adresy stron i edytora.
 * Testy: tests/unit/history-model.test.ts.
 */
import type { MonthKey } from '@/lib/i18n/pl';

export const HISTORY_PATH = '/app/raporty';

/** Identyfikator h1 historii (cel fokusu i odnośnika „przejdź do treści”). */
export const HISTORY_HEADING_ID = 'historia-raportow';

/**
 * Numer strony z ?strona=: brak → 1; liczba całkowita ≥ 1 zapisana cyframi (bez zer na początku) → ta
 * liczba; cokolwiek innego → null (strona przekierowuje na adres bez parametru).
 */
export function parsePageParam(raw: string | string[] | undefined): number | null {
  if (raw === undefined) return 1;
  if (typeof raw !== 'string' || !/^[1-9]\d{0,5}$/.test(raw)) return null;
  return Number(raw);
}

/** Adres strony historii: pierwsza bez parametru, kolejne z ?strona=N. */
export function historyHref(page: number): string {
  return page <= 1 ? HISTORY_PATH : `${HISTORY_PATH}?strona=${page}`;
}

/** Adres edytora raportu klienta za miesiąc (kontrakt tras: /app/klienci/{id}/{YYYY-MM}). */
export function reportHref(clientId: string, month: MonthKey): string {
  return `/app/klienci/${encodeURIComponent(clientId)}/${month}`;
}

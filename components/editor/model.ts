/**
 * Czyste funkcje edytora raportu z kontem (bez Reacta i bez bazy): krok startowy z ?krok=, poprawność
 * parametrów adresu i adres listy klientów. Testy: tests/unit/editor-model.test.ts.
 */
import { compareMonths } from '@/lib/dates';
import type { MonthKey } from '@/lib/i18n/pl';

/** Najwcześniejszy miesiąc edytora — ta sama granica co w panelu klientów. */
export const MIN_EDITOR_MONTH: MonthKey = '2000-01';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type InitialStep = 'upload' | 'effects' | 'send';

/** Identyfikator klienta i miesiąc z adresu: uuid i 'YYYY-MM' od MIN_EDITOR_MONTH do bieżącego miesiąca. */
export function validEditorParams(id: string, month: string, maxMonth: MonthKey): boolean {
  return (
    UUID.test(id) &&
    MONTH.test(month) &&
    compareMonths(month, maxMonth) <= 0 &&
    compareMonths(month, MIN_EDITOR_MONTH) >= 0
  );
}

/**
 * Krok startowy z ?krok=1|2|3. Bez zapisanego raportu zawsze krok 1 (nie ma czego edytować ani wysłać);
 * z zapisem domyślnie krok 2, krok 3 tylko wtedy, gdy raport jest zapisany.
 */
export function initialStep(krok: string | string[] | undefined, hasSaved: boolean): InitialStep {
  if (!hasSaved) return 'upload';
  const value = typeof krok === 'string' ? krok : undefined;
  if (value === '1') return 'upload';
  if (value === '3') return 'send';
  return 'effects';
}

/** Lista klientów za miesiąc raportu (link „Klienci” nad nagłówkiem). */
export function clientsHref(month: MonthKey): string {
  return `/app/klienci?m=${month}`;
}

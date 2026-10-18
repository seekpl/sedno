/**
 * Czyste funkcje panelu klientów (bez Reacta i bez bazy): miesiąc z adresu, działanie w wierszu,
 * dni robocze do końca miesiąca, inicjały, nazwa planu. Testy: tests/unit/panel-model.test.ts.
 */
import { PLANS } from '@/config/pricing';
import { panel as t } from '@/lib/copy/panel';
import { compareMonths, currentMonth, daysInMonth, lastFullMonth } from '@/lib/dates';
import { addMonths, isMonthKey, monthKey, warsawParts, type MonthKey } from '@/lib/i18n/pl';
import type { PanelStatus, Plan } from '@/lib/data/panel';

/** Najwcześniejszy miesiąc w panelu (granica przełącznika i parametru ?m=). */
export const MIN_PANEL_MONTH: MonthKey = '2000-01';

/** Identyfikator h1 panelu — tu wraca fokus, gdy znika przycisk, który go miał (pusty stan). */
export const PANEL_HEADING_ID = 'panel-klientow';

/**
 * Miesiąc z ?m=YYYY-MM: poprawny i nie późniejszy niż bieżący (późniejszy → bieżący, wcześniejszy niż
 * MIN_PANEL_MONTH → MIN_PANEL_MONTH). Brak albo błędna wartość → ostatni pełny miesiąc.
 */
export function resolvePanelMonth(raw: string | string[] | undefined, now: Date): MonthKey {
  const value = typeof raw === 'string' ? raw : undefined;
  if (!isMonthKey(value)) return lastFullMonth(now);
  const max = currentMonth(now);
  if (compareMonths(value, max) > 0) return max;
  if (compareMonths(value, MIN_PANEL_MONTH) < 0) return MIN_PANEL_MONTH;
  return value;
}

/** Adres edytora raportu klienta za miesiąc (kontrakt tras: /app/klienci/{id}/{YYYY-MM}). */
export function editorHref(clientId: string, month: MonthKey, step?: 1 | 2 | 3): string {
  const base = `/app/klienci/${encodeURIComponent(clientId)}/${month}`;
  return step ? `${base}?krok=${step}` : base;
}

export type RowAction = {
  /** Widoczne słowo, np. „Otwórz”. */
  label: string;
  /** Dopowiedzenie tylko dla czytników (po spacji), np. „raport: Studio Lumi”. */
  rest: string;
  href: string;
};

/**
 * Działanie w wierszu panelu: Wysłany → „Otwórz”, Gotowy → „Wyślij” (krok 3 edytora), Szkic → „Dokończ”,
 * brak raportu → „Wgraj”. Każde prowadzi do edytora raportu klienta za miesiąc.
 */
export function rowAction(
  status: PanelStatus,
  client: { id: string; name: string },
  month: MonthKey,
): RowAction {
  const copy = t.rowActions[status];
  return {
    label: copy.label,
    rest: copy.rest(client.name),
    href: editorHref(client.id, month, status === 'ready' ? 3 : undefined),
  };
}

/**
 * Dni robocze (poniedziałek–piątek) od dziś do końca bieżącego miesiąca, razem z dzisiejszym, w czasie
 * warszawskim. Święta pomijamy (docs/decisions.md).
 */
export function workingDaysLeft(now: Date): number {
  const { year, month, day } = warsawParts(now);
  const last = daysInMonth(monthKey(year, month));
  let count = 0;
  for (let d = day; d <= last; d++) {
    const weekday = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}

/** Zdanie o dniach roboczych tylko wtedy, gdy raporty za `month` są należne teraz (to miesiąc poprzedni). */
export function showsWorkingDays(month: MonthKey, now: Date): boolean {
  return month === addMonths(currentMonth(now), -1);
}

/**
 * Inicjały do awatara (EkranPanel.html): pierwsza litera pierwszego i ostatniego słowa („Bistro Pod Lipą”
 * → „BL”), przy jednym słowie dwie pierwsze litery („Kadr” → „KA”).
 */
export function initials(name: string): string {
  const words = name
    .split(/[\s-]+/)
    .map((word) => Array.from(word).filter((ch) => /[\p{L}\p{N}]/u.test(ch)))
    .filter((chars) => chars.length > 0);
  const first = words[0];
  const last = words[words.length - 1];
  if (!first || !last) return '';
  const letters = words.length > 1 ? [first[0], last[0]] : first.slice(0, 2);
  return letters.join('').toLocaleUpperCase('pl-PL');
}

/** Nazwa planu w plakietce paska: „Na start”, „Solo” (config/pricing.ts). */
export function planLabel(plan: Plan): string {
  return PLANS[plan].name;
}

/**
 * Granice miesięcy w strefie Europe/Warsaw (PROMPT.md §6, §7). Czyste funkcje bez bibliotek dat:
 * przesunięcie strefy liczy `Intl`, więc zmiana czasu (marzec, październik) jest uwzględniona.
 * Miesiąc to klucz 'YYYY-MM' (lib/i18n/pl.ts).
 */
import {
  addMonths,
  parseMonthKey,
  TIME_ZONE,
  warsawMonthKey,
  warsawParts,
  type MonthKey,
} from '@/lib/i18n/pl';

const wallClockFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

/** Przesunięcie czasu warszawskiego względem UTC w danej chwili, w milisekundach (+1 h zimą, +2 h latem). */
function warsawOffsetMs(date: Date): number {
  const parts = wallClockFormat.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const wallClock = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  const wholeSeconds = Math.floor(date.getTime() / 1000) * 1000;
  return wallClock - wholeSeconds;
}

/**
 * Chwila odpowiadająca godzinie zegarowej w Warszawie, np. 1 października 2026, 00:00 → 2026-09-30T22:00Z.
 * Dwa przybliżenia wystarczają, bo przesunięcie zmienia się najwyżej o godzinę (drugie jest potrzebne
 * np. dla 01:30 w dniu zmiany czasu). Godziny z luki wiosennej (02:00–03:00 w ostatnią niedzielę marca)
 * nie istnieją i przesuwają się o godzinę do przodu; godzina podwójna jesienią (02:00–03:00 w ostatnią
 * niedzielę października) daje późniejszą chwilę (czas zimowy). Ten moduł liczy tylko północe, których
 * to nie dotyczy; daty z pliku zamienia parser (lib/csv/values.ts).
 */
export function warsawInstant(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): Date {
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const firstGuess = wallClock - warsawOffsetMs(new Date(wallClock));
  return new Date(wallClock - warsawOffsetMs(new Date(firstGuess)));
}

/** Początek dnia (00:00 czasu warszawskiego) dla chwili `date`. */
export function dayStart(date: Date): number {
  const { year, month, day } = warsawParts(date);
  return warsawInstant(year, month, day).getTime();
}

/** Liczba dni w miesiącu (luty przestępny: 29). */
export function daysInMonth(key: MonthKey): number {
  const { year, month } = parseMonthKey(key);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Początek miesiąca: 1. dzień, 00:00:00.000 czasu warszawskiego. */
export function monthStart(key: MonthKey): Date {
  const { year, month } = parseMonthKey(key);
  return warsawInstant(year, month, 1);
}

/** Ostatnia chwila miesiąca: ostatni dzień, 23:59:59.999 czasu warszawskiego. */
export function monthEnd(key: MonthKey): Date {
  return new Date(monthStart(addMonths(key, 1)).getTime() - 1);
}

/**
 * Początek ostatniego dnia miesiąca (00:00 czasu warszawskiego). Nie liczymy go jako „koniec − 24 h”,
 * bo dzień zmiany czasu ma 23 albo 25 godzin (np. 31 marca 2024, 31 października 2021).
 */
export function lastDayStart(key: MonthKey): Date {
  const { year, month } = parseMonthKey(key);
  return warsawInstant(year, month, daysInMonth(key));
}

/** Bieżący miesiąc w Warszawie. */
export function currentMonth(now: Date): MonthKey {
  return warsawMonthKey(now);
}

/** Ostatni pełny miesiąc, czyli miesiąc przed bieżącym (12 października 2026 → '2026-09'). */
export function lastFullMonth(now: Date): MonthKey {
  return addMonths(currentMonth(now), -1);
}

/** Porównanie miesięcy: −1, gdy a jest wcześniej, 0, gdy to ten sam miesiąc, 1, gdy później. */
export function compareMonths(a: MonthKey, b: MonthKey): -1 | 0 | 1 {
  const x = parseMonthKey(a);
  const y = parseMonthKey(b);
  const diff = x.year * 12 + x.month - (y.year * 12 + y.month);
  return diff < 0 ? -1 : diff > 0 ? 1 : 0;
}

/** Miesiąc jeszcze trwa: `now` mieści się między jego początkiem a końcem (czas warszawski). */
export function isMonthInProgress(key: MonthKey, now: Date): boolean {
  return compareMonths(key, currentMonth(now)) === 0;
}

/** Miesiąc minął: `now` jest po jego ostatniej chwili. */
export function isMonthOver(key: MonthKey, now: Date): boolean {
  return compareMonths(key, currentMonth(now)) < 0;
}

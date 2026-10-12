import { describe, expect, it } from 'vitest';
import {
  compareMonths,
  currentMonth,
  daysInMonth,
  isMonthInProgress,
  isMonthOver,
  lastDayStart,
  lastFullMonth,
  monthEnd,
  monthStart,
  warsawInstant,
} from '@/lib/dates';
import { warsawMonthKey, warsawParts } from '@/lib/i18n/pl';

const iso = (d: Date) => d.toISOString();

describe('monthStart / monthEnd (Europe/Warsaw)', () => {
  it('wrzesień 2026 (czas letni, +02:00)', () => {
    expect(iso(monthStart('2026-09'))).toBe('2026-08-31T22:00:00.000Z');
    expect(iso(monthEnd('2026-09'))).toBe('2026-09-30T21:59:59.999Z');
  });

  it('styczeń 2026 (czas zimowy, +01:00) i przełom roku', () => {
    expect(iso(monthStart('2026-01'))).toBe('2025-12-31T23:00:00.000Z');
    expect(iso(monthEnd('2025-12'))).toBe('2025-12-31T22:59:59.999Z');
  });

  it('marzec 2026: zaczyna się zimą, kończy latem (zmiana 29 marca)', () => {
    expect(iso(monthStart('2026-03'))).toBe('2026-02-28T23:00:00.000Z');
    expect(iso(monthEnd('2026-03'))).toBe('2026-03-31T21:59:59.999Z');
    expect(iso(monthStart('2026-04'))).toBe('2026-03-31T22:00:00.000Z');
  });

  it('październik 2026: zaczyna się latem, kończy zimą (zmiana 25 października)', () => {
    expect(iso(monthStart('2026-10'))).toBe('2026-09-30T22:00:00.000Z');
    expect(iso(monthEnd('2026-10'))).toBe('2026-10-31T22:59:59.999Z');
    expect(iso(monthStart('2026-11'))).toBe('2026-10-31T23:00:00.000Z');
  });

  it('granice dają właściwy miesiąc w Warszawie', () => {
    for (const key of ['2026-03', '2026-10', '2024-02', '2021-10', '2024-03']) {
      expect(warsawMonthKey(monthStart(key))).toBe(key);
      expect(warsawMonthKey(monthEnd(key))).toBe(key);
      expect(warsawMonthKey(new Date(monthStart(key).getTime() - 1))).not.toBe(key);
      expect(warsawMonthKey(new Date(monthEnd(key).getTime() + 1))).not.toBe(key);
    }
  });

  it('koniec miesiąca to 1 ms przed początkiem następnego', () => {
    expect(monthEnd('2026-10').getTime() + 1).toBe(monthStart('2026-11').getTime());
    expect(monthEnd('2026-12').getTime() + 1).toBe(monthStart('2027-01').getTime());
  });
});

describe('lastDayStart', () => {
  it('31 marca 2024 (dzień zmiany czasu, 23 h) zaczyna się o 00:00 czasu zimowego', () => {
    expect(iso(lastDayStart('2024-03'))).toBe('2024-03-30T23:00:00.000Z');
    expect(monthEnd('2024-03').getTime() - lastDayStart('2024-03').getTime() + 1).toBe(23 * 3600_000);
  });

  it('31 października 2021 (dzień zmiany czasu, 25 h) zaczyna się o 00:00 czasu letniego', () => {
    expect(iso(lastDayStart('2021-10'))).toBe('2021-10-30T22:00:00.000Z');
    expect(monthEnd('2021-10').getTime() - lastDayStart('2021-10').getTime() + 1).toBe(25 * 3600_000);
  });

  it('zwykły miesiąc: 30 września 2026, 00:00', () => {
    expect(iso(lastDayStart('2026-09'))).toBe('2026-09-29T22:00:00.000Z');
    expect(warsawParts(lastDayStart('2026-09'))).toEqual({ year: 2026, month: 9, day: 30 });
  });
});

describe('warsawInstant', () => {
  it('godzina zegarowa w Warszawie → chwila UTC', () => {
    expect(iso(warsawInstant(2026, 10, 12, 10, 30))).toBe('2026-10-12T08:30:00.000Z');
    expect(iso(warsawInstant(2026, 12, 24, 18))).toBe('2026-12-24T17:00:00.000Z');
    expect(iso(warsawInstant(2026, 3, 29, 3))).toBe('2026-03-29T01:00:00.000Z');
    expect(iso(warsawInstant(2026, 10, 25, 4))).toBe('2026-10-25T03:00:00.000Z');
  });

  it('godzina tuż przed zmianą czasu (wymaga drugiego przybliżenia)', () => {
    // 01:30 czasu zimowego 29 marca 2026 i 01:30 czasu letniego 25 października 2026.
    expect(iso(warsawInstant(2026, 3, 29, 1, 30))).toBe('2026-03-29T00:30:00.000Z');
    expect(iso(warsawInstant(2026, 10, 25, 1, 30))).toBe('2026-10-24T23:30:00.000Z');
  });

  it('luka wiosenna przesuwa się do przodu, godzina podwójna jesienią daje czas zimowy', () => {
    expect(iso(warsawInstant(2026, 3, 29, 2, 30))).toBe('2026-03-29T01:30:00.000Z');
    expect(iso(warsawInstant(2026, 10, 25, 2, 30))).toBe('2026-10-25T01:30:00.000Z');
  });
});

describe('daysInMonth', () => {
  it.each([
    ['2026-09', 30],
    ['2026-10', 31],
    ['2026-02', 28],
    ['2028-02', 29],
    ['2100-02', 28],
    ['2000-02', 29],
  ])('%s → %i', (key, days) => {
    expect(daysInMonth(key)).toBe(days);
  });
});

describe('miesiąc bieżący i ostatni pełny', () => {
  const now = new Date('2026-10-12T10:00:00+02:00');

  it('12 października 2026', () => {
    expect(currentMonth(now)).toBe('2026-10');
    expect(lastFullMonth(now)).toBe('2026-09');
  });

  it('styczeń → grudzień poprzedniego roku', () => {
    expect(lastFullMonth(new Date('2027-01-05T12:00:00+01:00'))).toBe('2026-12');
  });

  it('północ 1 października w Warszawie to już październik (choć w UTC jeszcze wrzesień)', () => {
    const midnight = new Date('2026-09-30T22:00:00Z');
    expect(currentMonth(midnight)).toBe('2026-10');
    expect(currentMonth(new Date(midnight.getTime() - 1))).toBe('2026-09');
  });

  it('isMonthInProgress / isMonthOver', () => {
    expect(isMonthInProgress('2026-10', now)).toBe(true);
    expect(isMonthOver('2026-10', now)).toBe(false);
    expect(isMonthInProgress('2026-09', now)).toBe(false);
    expect(isMonthOver('2026-09', now)).toBe(true);
    expect(isMonthOver('2025-12', now)).toBe(true);
    expect(isMonthInProgress('2026-11', now)).toBe(false);
    expect(isMonthOver('2026-11', now)).toBe(false);
  });

  it('isMonthOver dokładnie na granicy', () => {
    const end = monthEnd('2026-09');
    expect(isMonthOver('2026-09', end)).toBe(false);
    expect(isMonthInProgress('2026-09', end)).toBe(true);
    expect(isMonthOver('2026-09', new Date(end.getTime() + 1))).toBe(true);
  });
});

describe('compareMonths', () => {
  it('porządek miesięcy', () => {
    expect(compareMonths('2025-04', '2025-05')).toBe(-1);
    expect(compareMonths('2025-05', '2025-04')).toBe(1);
    expect(compareMonths('2025-04', '2025-04')).toBe(0);
    expect(compareMonths('2024-12', '2025-01')).toBe(-1);
    expect(compareMonths('2026-01', '2025-12')).toBe(1);
  });

  it('niepoprawny klucz to błąd programisty', () => {
    expect(() => compareMonths('2025-13', '2025-01')).toThrow();
    expect(() => monthStart('wrzesień')).toThrow();
  });
});

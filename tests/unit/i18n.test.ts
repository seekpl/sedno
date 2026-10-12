import { describe, expect, it } from 'vitest';
import {
  addMonths,
  formatCurrency,
  formatDate,
  formatDateRange,
  formatDateRangeShort,
  formatDayMonth,
  formatFileSize,
  formatMonthChange,
  formatNumber,
  slugify,
  warsawMonthKey,
  monthForms,
  monthLabel,
  monthLabelShort,
  plural,
} from '@/lib/i18n/pl';

const osoby = ['osoba', 'osoby', 'osób'] as const;

describe('plural', () => {
  it.each([
    [0, 'osób'],
    [1, 'osoba'],
    [2, 'osoby'],
    [4, 'osoby'],
    [5, 'osób'],
    [12, 'osób'],
    [13, 'osób'],
    [14, 'osób'],
    [21, 'osób'],
    [22, 'osoby'],
    [24, 'osoby'],
    [25, 'osób'],
    [102, 'osoby'],
    [112, 'osób'],
    [1234, 'osoby'],
  ])('%i → %s', (n, form) => {
    expect(plural(n, osoby)).toBe(form);
  });
});

describe('miesiące', () => {
  it('ma cztery przypadki i „we wrześniu”', () => {
    expect(monthForms('2026-09')).toMatchObject({
      nom: 'wrzesień',
      gen: 'września',
      ins: 'wrześniem',
      loc: 'we wrześniu',
    });
    expect(monthForms('2026-02').loc).toBe('w lutym');
    expect(monthForms('2026-11').loc).toBe('w listopadzie');
  });

  it('etykiety przełącznika', () => {
    expect(monthLabel('2026-09')).toBe('Wrzesień 2026');
    expect(monthLabelShort('2026-09')).toBe('Wrz 2026');
  });

  it('dodaje miesiące przez granicę roku', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2025-12', 1)).toBe('2026-01');
    expect(addMonths('2026-09', -13)).toBe('2025-08');
  });
});

describe('formaty', () => {
  it('liczby: 4 cyfry bez spacji, od 5 cyfr twarda spacja U+00A0', () => {
    expect(formatNumber(1840)).toBe('1840');
    expect(formatNumber(12480)).toBe('12 480');
    expect(formatNumber(1234567)).toBe('1 234 567');
  });

  it('brak danych to „—”, nie 0', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
    expect(formatNumber(0)).toBe('0');
  });

  it('minus to prawdziwy znak „−” (U+2212)', () => {
    expect(formatNumber(-4)).toBe('−4');
  });

  it('kwoty w złotych', () => {
    expect(formatCurrency(11.07)).toBe('11,07 zł');
  });

  it('rozmiar pliku', () => {
    expect(formatFileSize(48 * 1024)).toBe('48 KB');
    expect(formatFileSize(1.25 * 1024 * 1024)).toBe('1,3 MB');
  });
});

describe('daty (Europe/Warsaw)', () => {
  const d = (iso: string) => new Date(iso);

  it('zakres w jednym miesiącu z półpauzą', () => {
    expect(formatDateRange(d('2026-09-01T10:00:00+02:00'), d('2026-09-30T20:00:00+02:00'))).toBe(
      '1–30 września 2026',
    );
  });

  it('zakres przez granicę miesiąca i roku', () => {
    expect(formatDateRange(d('2026-08-28T10:00:00+02:00'), d('2026-09-03T10:00:00+02:00'))).toBe(
      '28 sierpnia – 3 września 2026',
    );
    expect(formatDateRange(d('2025-12-28T10:00:00+01:00'), d('2026-01-03T10:00:00+01:00'))).toBe(
      '28 grudnia 2025 – 3 stycznia 2026',
    );
  });

  it('jeden dzień', () => {
    expect(formatDateRange(d('2026-09-27T10:00:00+02:00'), d('2026-09-27T12:00:00+02:00'))).toBe(
      '27 września 2026',
    );
  });

  it('krótki zakres do PDF', () => {
    expect(formatDateRangeShort(d('2026-09-01T10:00:00+02:00'), d('2026-09-30T10:00:00+02:00'))).toBe(
      '1–30.09.2026',
    );
  });

  it('miesiąc liczony w strefie Warszawy, nie UTC', () => {
    // 30.09 23:30 UTC = 1.10 01:30 w Warszawie
    expect(warsawMonthKey(d('2026-09-30T23:30:00Z'))).toBe('2026-10');
    expect(formatDayMonth(d('2026-09-30T23:30:00Z'))).toBe('1 października');
    expect(formatDate(d('2026-01-31T23:30:00Z'))).toBe('1 lutego 2026');
  });
});

describe('formatMonthChange', () => {
  it('pokazuje zmianę tylko przy M−1 ≥ 1000 i |zmiana| ≥ 1%', () => {
    expect(formatMonthChange(12480, 11420)).toBe('+9% m/m');
    expect(formatMonthChange(9600, 10000)).toBe('−4% m/m');
    expect(formatMonthChange(1500, 999)).toBeNull();
    expect(formatMonthChange(10050, 10000)).toBeNull();
    expect(formatMonthChange(null, 10000)).toBeNull();
    expect(formatMonthChange(5000, null)).toBeNull();
  });
});

describe('slugify', () => {
  it('usuwa polskie znaki', () => {
    expect(slugify('Bistro Pod Lipą')).toBe('bistro-pod-lipa');
    expect(slugify('Żółć & Gęśla Jaźń — Łódź')).toBe('zolc-gesla-jazn-lodz');
    expect(slugify('***')).toBe('klient');
  });
});

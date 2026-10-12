import { describe, expect, it } from 'vitest';
import {
  addMonths,
  formatCurrency,
  formatFileSize,
  formatNumber,
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

import { describe, expect, it } from 'vitest';
import { warsawMonthKey } from '@/lib/i18n/pl';
import {
  detectDateOrder,
  normalizeType,
  parseDate,
  parseNumber,
  sanitizePermalink,
  warsawMonthKeyFast,
  warsawWallClockToDate,
} from '@/lib/csv/values';
import { PERMALINK_CASES } from '@/scripts/make-fixtures';

describe('parseNumber', () => {
  it.each([
    ['0', 0],
    ['42', 42],
    ['1234', 1234],
    ['1 234', 1234],
    ['1 234', 1234],
    ['12 480', 12480],
    ['1,234', 1234],
    ['1.234', 1234],
    ['12,345', 12345],
    ['123.456', 123456],
    ['1.234.567', 1234567],
    ['1,234,567', 1234567],
    ['1 234 567', 1234567],
    ['1.234,5', 1234.5],
    ['1,234.5', 1234.5],
    ['1.234.567,89', 1234567.89],
    ['12,5', 12.5],
    ['12.5', 12.5],
    ['0,123', 0.123],
    ['1234,567', 1234.567],
    ['12,50', 12.5],
    ['+15', 15],
    [' 7 ', 7],
    ['1.2E+04', 12000],
  ])('%j → %d', (raw, expected) => {
    expect(parseNumber(raw)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    '-',
    '–',
    '—',
    'N/A',
    'n/a',
    'NA',
    'brak',
    'Lifetime',
    'abc',
    '12a',
    '1,2,3',
    '1.23.456',
    '1,234.5.6',
  ])('brak danych lub śmieci %j → null (nie 0)', (raw) => {
    expect(parseNumber(raw)).toBeNull();
  });

  it('liczby ujemne → null (licznik nie może być ujemny)', () => {
    expect(parseNumber('-5')).toBeNull();
    expect(parseNumber('−5')).toBeNull();
    expect(parseNumber('-1,234')).toBeNull();
  });

  it('null i undefined → null', () => {
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
  });
});

const iso = (d: Date | null) => d?.toISOString() ?? null;

describe('parseDate', () => {
  it.each([
    ['2026-09-01T10:15:00+02:00', '2026-09-01T08:15:00.000Z'],
    ['2026-09-01T10:15:00Z', '2026-09-01T10:15:00.000Z'],
    ['2026-09-01T10:15:00.250Z', '2026-09-01T10:15:00.000Z'],
    ['2026-09-01T10:15:00+0530', '2026-09-01T04:45:00.000Z'],
    ['2026-09-01T10:15:00-04:00', '2026-09-01T14:15:00.000Z'],
    ['2026-09-01T10:15:00', '2026-09-01T08:15:00.000Z'],
    ['2026-09-01 10:15', '2026-09-01T08:15:00.000Z'],
    ['2026-09-01', '2026-08-31T22:00:00.000Z'],
    ['2026-01-15 12:00', '2026-01-15T11:00:00.000Z'],
    ['2026/09/01 10:15', '2026-09-01T08:15:00.000Z'],
    ['09/01/2026 10:15', '2026-09-01T08:15:00.000Z'],
    ['9/1/2026 10:15', '2026-09-01T08:15:00.000Z'],
    ['09/01/2026, 10:15', '2026-09-01T08:15:00.000Z'],
    ['09/01/2026 1:05 PM', '2026-09-01T11:05:00.000Z'],
    ['09/01/2026 12:00 AM', '2026-08-31T22:00:00.000Z'],
    ['09/01/2026 12:30 pm', '2026-09-01T10:30:00.000Z'],
    ['01.09.2026 10:15', '2026-09-01T08:15:00.000Z'],
    ['01.09.2026 10:15:30', '2026-09-01T08:15:30.000Z'],
    ['1.9.2026', '2026-08-31T22:00:00.000Z'],
  ])('%s → %s (czas warszawski, gdy bez strefy)', (raw, expected) => {
    expect(iso(parseDate(raw))).toBe(expected);
  });

  it('niejednoznaczna data według kolejności kolumny', () => {
    expect(iso(parseDate('05/09/2026 10:00', 'mdy'))).toBe('2026-05-09T08:00:00.000Z');
    expect(iso(parseDate('05/09/2026 10:00', 'dmy'))).toBe('2026-09-05T08:00:00.000Z');
    expect(iso(parseDate('13/09/2026', 'dmy'))).toBe('2026-09-12T22:00:00.000Z');
    // Bez rozstrzygnięcia: „/” to eksport amerykański, „.” to polski zapis.
    expect(iso(parseDate('05/09/2026 10:00'))).toBe('2026-05-09T08:00:00.000Z');
    expect(iso(parseDate('05.09.2026 10:00'))).toBe('2026-09-05T08:00:00.000Z');
  });

  it.each([
    '',
    '   ',
    'Lifetime',
    'Łącznie',
    'Suma',
    '2026-13-01',
    '2026-02-30',
    '02/30/2026',
    '13/13/2026',
    '09/01/2026 25:00',
    '09/01/2026 10:60',
    '09/01/2026 13:00 PM',
    '2026-09-01T10:15:00+25',
    '1.9.26',
  ])('%j → null', (raw) => {
    expect(parseDate(raw)).toBeNull();
  });

  it('29 lutego tylko w roku przestępnym', () => {
    expect(parseDate('2028-02-29')).not.toBeNull();
    expect(parseDate('2027-02-29')).toBeNull();
  });

  describe('zmiana czasu w Europe/Warsaw', () => {
    it('przed i po zmianie na czas letni (29 marca 2026)', () => {
      expect(iso(parseDate('2026-03-29 01:59'))).toBe('2026-03-29T00:59:00.000Z');
      expect(iso(parseDate('2026-03-29 03:00'))).toBe('2026-03-29T01:00:00.000Z');
    });

    it('godzina, której nie ma (2:30 29 marca 2026), przesuwa się na 3:30 czasu letniego', () => {
      expect(iso(parseDate('2026-03-29 02:30'))).toBe('2026-03-29T01:30:00.000Z');
      expect(iso(parseDate('03/29/2026 02:30'))).toBe('2026-03-29T01:30:00.000Z');
    });

    it('godzina podwójna (2:30 25 października 2026) to wcześniejsza chwila (czas letni)', () => {
      expect(iso(parseDate('2026-10-25 02:30'))).toBe('2026-10-25T00:30:00.000Z');
      expect(iso(parseDate('25.10.2026 02:30'))).toBe('2026-10-25T00:30:00.000Z');
    });

    it('wokół zmiany na czas zimowy (25 października 2026)', () => {
      expect(iso(parseDate('2026-10-25 01:30'))).toBe('2026-10-24T23:30:00.000Z');
      expect(iso(parseDate('2026-10-25 03:30'))).toBe('2026-10-25T02:30:00.000Z');
      expect(iso(parseDate('2026-10-26 12:00'))).toBe('2026-10-26T11:00:00.000Z');
    });

    it('jawne przesunięcie wygrywa ze strefą', () => {
      expect(iso(parseDate('2026-10-25T02:30:00+01:00'))).toBe('2026-10-25T01:30:00.000Z');
    });

    it('północ na granicy miesiąca należy do właściwego miesiąca w Warszawie', () => {
      const d = parseDate('2026-10-01 00:30')!;
      expect(d.toISOString()).toBe('2026-09-30T22:30:00.000Z');
      expect(warsawMonthKey(d)).toBe('2026-10');
      expect(warsawMonthKey(parseDate('2026-09-30 23:59')!)).toBe('2026-09');
    });

    it('warsawWallClockToDate zimą i latem', () => {
      expect(warsawWallClockToDate(2026, 1, 1).toISOString()).toBe('2025-12-31T23:00:00.000Z');
      expect(warsawWallClockToDate(2026, 7, 1, 12).toISOString()).toBe('2026-07-01T10:00:00.000Z');
    });
  });
});

describe('warsawMonthKeyFast', () => {
  it('daje to samo co warsawMonthKey (granice miesięcy, zmiany czasu, losowe chwile)', () => {
    const instants: number[] = [];
    for (let year = 2024; year <= 2027; year++) {
      for (let month = 0; month < 12; month++) {
        const firstUtc = Date.UTC(year, month, 1);
        for (const delta of [-3, -2, -1, 0, 1, 2, 3]) {
          instants.push(firstUtc + delta * 3_600_000 - 1000, firstUtc + delta * 3_600_000);
        }
      }
    }
    // 2026-03-29 i 2026-10-25: każda godzina doby zmiany czasu.
    for (const day of [Date.UTC(2026, 2, 29), Date.UTC(2026, 9, 25)]) {
      for (let h = -2; h < 26; h++) instants.push(day + h * 3_600_000, day + h * 3_600_000 + 1_799_000);
    }
    let seed = 42;
    for (let i = 0; i < 500; i++) {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      instants.push(Date.UTC(2024, 0, 1) + (seed / 2 ** 31) * 4 * 365 * 86_400_000);
    }
    for (const t of instants) {
      const date = new Date(Math.floor(t / 1000) * 1000);
      expect(warsawMonthKeyFast(date), date.toISOString()).toBe(warsawMonthKey(date));
    }
  });
});

describe('detectDateOrder', () => {
  it.each([
    [['09/13/2026 10:00', '09/01/2026 08:00'], 'mdy'],
    [['13/09/2026 10:00', '01/09/2026 08:00'], 'dmy'],
    [['01/09/2026'], 'mdy'],
    [['01.09.2026 10:00'], 'dmy'],
    [['13.09.2026'], 'dmy'],
    [['09.13.2026'], 'mdy'],
    [['01-09-2026'], 'dmy'],
    [['13/01/2026', '01/13/2026'], 'mdy'],
    [['13.01.2026', '01.13.2026'], 'dmy'],
  ] as const)('%j → %s', (values, order) => {
    expect(detectDateOrder(values)).toBe(order);
  });

  it('bez dat z „/” i „.” → null', () => {
    expect(detectDateOrder(['2026-09-01 10:00', 'Lifetime', ''])).toBeNull();
    expect(detectDateOrder([])).toBeNull();
  });
});

describe('normalizeType', () => {
  it.each([
    ['IG reel', 'reel'],
    ['Reels', 'reel'],
    ['Rolka na Instagramie', 'reel'],
    ['rolki', 'reel'],
    ['IG carousel', 'carousel'],
    ['Karuzela na Instagramie', 'carousel'],
    ['Post z karuzelą', 'carousel'],
    ['Album', 'carousel'],
    ['IG story', 'story'],
    ['Stories', 'story'],
    ['Relacja na Instagramie', 'story'],
    ['relacje', 'story'],
    ['IG image', 'post'],
    ['Photo', 'post'],
    ['Zdjęcie na Instagramie', 'post'],
    ['Obraz na Instagramie', 'post'],
    ['IG video', 'post'],
    ['Wideo', 'post'],
    ['Film', 'post'],
    ['Post', 'post'],
    ['Transmisja na żywo', 'other'],
    ['', 'other'],
    [null, 'other'],
  ] as const)('%j → %s', (raw, type) => {
    expect(normalizeType(raw)).toBe(type);
  });
});

describe('sanitizePermalink', () => {
  it.each(PERMALINK_CASES)('%j → %j', (raw, expected) => {
    expect(sanitizePermalink(raw)).toBe(expected);
  });

  it.each([
    'https://www.instagram.com/',
    'https://www.instagram.com/p/AbC_12-x/',
    'https://www.instagram.com/stories/konto.przyklad/123/',
    'https://www.instagram.com/p/x/?utm_source=ig&igsh=a%20b',
  ])('przepuszcza %s', (url) => {
    expect(sanitizePermalink(url)).toBe(url);
  });

  it.each([
    'HTTPS://WWW.INSTAGRAM.COM/p/x/',
    'https://www.instagram.com',
    'https://www.instagram.com/p/x/#hash',
    'https://www.instagram.com/p/<x>/',
    'https://www.instagram.com/p/x/ y',
    'https://www.instagram.com@evil.example/',
    '//www.instagram.com/p/x/',
    'vbscript:msgbox(1)',
    `https://www.instagram.com/${'a'.repeat(300)}`,
  ])('odrzuca %s', (url) => {
    expect(sanitizePermalink(url)).toBeUndefined();
  });

  it('pusty → undefined', () => {
    expect(sanitizePermalink('')).toBeUndefined();
    expect(sanitizePermalink(undefined)).toBeUndefined();
  });
});

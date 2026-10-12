// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COLUMN_MAPPING_KEY, loadColumnMapping, saveColumnMapping } from '@/lib/csv/mapping-storage';
import type { ColumnMapping } from '@/lib/csv/types';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('mapowanie kolumn w localStorage', () => {
  it('pusty magazyn → puste mapowanie', () => {
    expect(loadColumnMapping()).toEqual({});
  });

  it('zapisuje pod kluczem sedno.columnMapping.v1 i odczytuje', () => {
    saveColumnMapping({ Kiedy: 'publishedAt', 'Ile razy obejrzano': 'views' });
    expect(COLUMN_MAPPING_KEY).toBe('sedno.columnMapping.v1');
    expect(JSON.parse(window.localStorage.getItem(COLUMN_MAPPING_KEY)!)).toEqual({
      Kiedy: 'publishedAt',
      'Ile razy obejrzano': 'views',
    });
    expect(loadColumnMapping()).toEqual({ Kiedy: 'publishedAt', 'Ile razy obejrzano': 'views' });
  });

  it('dopisuje do istniejącego; nowy wybór nadpisuje stary dla tego samego nagłówka', () => {
    saveColumnMapping({ Kiedy: 'publishedAt', Ile: 'views' });
    saveColumnMapping({ Ile: 'reach', Rodzaj: 'type' });
    expect(loadColumnMapping()).toEqual({ Kiedy: 'publishedAt', Ile: 'reach', Rodzaj: 'type' });
  });

  it('zapisuje tylko nagłówki i znane pola (bez długich tekstów, nieznanych pól, pustych kluczy)', () => {
    saveColumnMapping({
      ' Kiedy ': 'publishedAt',
      '': 'views',
      [`Bardzo długi tekst ${'x'.repeat(200)}`]: 'views',
      Wyświetlenia: 'impressions',
    } as unknown as ColumnMapping);
    expect(loadColumnMapping()).toEqual({ Kiedy: 'publishedAt' });
  });

  it('uszkodzone dane w magazynie → puste mapowanie', () => {
    for (const raw of ['{nie json', '[]', '"tekst"', '42', 'null', '{"Kiedy": 5}']) {
      window.localStorage.setItem(COLUMN_MAPPING_KEY, raw);
      expect(loadColumnMapping()).toEqual({});
    }
  });

  it('nagłówki o nazwach pól obiektu („constructor”, „toString”, „__proto__”) zostają przy dopisywaniu', () => {
    saveColumnMapping({ constructor: 'views', toString: 'publishedAt' } as unknown as ColumnMapping);
    saveColumnMapping(JSON.parse('{"__proto__": "type"}') as ColumnMapping);
    saveColumnMapping({ Kiedy: 'publishedAt' });
    const stored = JSON.parse(window.localStorage.getItem(COLUMN_MAPPING_KEY)!) as Record<string, string>;
    expect(stored).toEqual(
      JSON.parse('{"Kiedy":"publishedAt","__proto__":"type","constructor":"views","toString":"publishedAt"}'),
    );
    const loaded = loadColumnMapping();
    expect(Object.getPrototypeOf(loaded)).toBe(Object.prototype);
    expect(Object.keys(loaded).sort()).toEqual(['Kiedy', '__proto__', 'constructor', 'toString']);
  });

  it('nowy wybór nie wypada przez limit wpisów', () => {
    const many = Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [`Kolumna ${i}`, 'likes']),
    ) as ColumnMapping;
    saveColumnMapping(many);
    saveColumnMapping({ Kiedy: 'publishedAt' });
    const loaded = loadColumnMapping();
    expect(loaded.Kiedy).toBe('publishedAt');
    expect(Object.keys(loaded)).toHaveLength(100);
  });

  it('zablokowany localStorage: odczyt zwraca {}, zapis nie rzuca', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(loadColumnMapping()).toEqual({});
    expect(() => saveColumnMapping({ Kiedy: 'publishedAt' })).not.toThrow();
  });

  it('dostęp do window.localStorage rzuca (zablokowane dane witryny)', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(loadColumnMapping()).toEqual({});
    expect(() => saveColumnMapping({ Kiedy: 'publishedAt' })).not.toThrow();
  });

  it('bez window (renderowanie po stronie serwera)', () => {
    vi.stubGlobal('window', undefined);
    expect(loadColumnMapping()).toEqual({});
    expect(() => saveColumnMapping({ Kiedy: 'publishedAt' })).not.toThrow();
  });
});

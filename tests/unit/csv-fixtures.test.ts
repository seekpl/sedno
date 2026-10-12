/**
 * Każdy plik z tests/fixtures/synthetic-* przez parser (PROMPT.md §17) oraz zgodność plików
 * z generatorem scripts/make-fixtures.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { warsawMonthKey, warsawParts } from '@/lib/i18n/pl';
import { parseExport } from '@/lib/csv/parse';
import type { ColumnMapping, ParseResult, ParsedExport, PostRow, PostType } from '@/lib/csv/types';
import { EXAMPLE_REPORT } from '@/lib/report/example';
import {
  CP1250_TOTALS,
  DESCRIPTIONS,
  EN_TOTALS,
  FIXTURES_DIR,
  MAIN_TOTALS,
  PERMALINK_CASES,
  PREAMBLE_TOTALS,
  PRIVACY_CANARY,
  TAB_TOTALS,
  buildFixtures,
} from '@/scripts/make-fixtures';

function load(name: string, mapping?: ColumnMapping): ParseResult {
  const buf = fs.readFileSync(path.join(FIXTURES_DIR, name));
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const mimeType = name.endsWith('.csv') ? 'text/csv' : 'text/plain';
  return parseExport({ bytes, fileName: name, mimeType }, { mapping });
}

function ok(result: ParseResult): ParsedExport {
  if (!result.ok) throw new Error(`Oczekiwano wyniku, jest błąd: ${JSON.stringify(result.error)}`);
  return result.data;
}

/** Niezależne od lib/report/compute.ts podsumowanie miesiąca — tylko do sprawdzenia fixtures. */
function summary(rows: PostRow[], month?: string) {
  const inMonth = month ? rows.filter((r) => warsawMonthKey(r.publishedAt) === month) : rows;
  const sum = (pick: (r: PostRow) => number | null) => inMonth.reduce((acc, r) => acc + (pick(r) ?? 0), 0);
  const byType: Partial<Record<PostType, number>> = {};
  for (const r of inMonth) byType[r.type] = (byType[r.type] ?? 0) + 1;
  return {
    posts: inMonth.length,
    byType,
    views: sum((r) => r.views),
    interactions: sum((r) => r.likes) + sum((r) => r.comments) + sum((r) => r.shares) + sum((r) => r.saves),
    follows: sum((r) => r.follows),
  };
}

const ALL_FIELDS = [
  'publishedAt',
  'views',
  'reach',
  'likes',
  'comments',
  'shares',
  'saves',
  'follows',
  'type',
  'permalink',
] as const;

describe('generator fixtures', () => {
  it('pliki w repozytorium odpowiadają scripts/make-fixtures.ts', () => {
    const built = buildFixtures();
    for (const [name, bytes] of built) {
      const onDisk = new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, name)));
      expect(Buffer.from(onDisk).equals(Buffer.from(bytes)), name).toBe(true);
    }
    const synthetic = fs.readdirSync(FIXTURES_DIR).filter((name) => name.startsWith('synthetic-'));
    expect(synthetic.sort()).toEqual([...built.keys()].sort());
  });
});

describe('synthetic-pl-semicolon-bom.csv (PL, średnik, BOM, sierpień i wrzesień 2026)', () => {
  const data = ok(load('synthetic-pl-semicolon-bom.csv'));

  it('wszystkie wiersze, oba miesiące, wszystkie pola bez opisu, bez ostrzeżeń', () => {
    expect(data.rows).toHaveLength(59);
    expect(data.months).toEqual(['2026-08', '2026-09']);
    expect(data.fields).toEqual([...ALL_FIELDS]);
    expect(data.warnings).toEqual([]);
  });

  it('wrzesień zgadza się z lib/report/example.ts', () => {
    const sep = summary(data.rows, '2026-09');
    expect(sep).toEqual(MAIN_TOTALS['2026-09']);
    expect(sep).toEqual({
      posts: EXAMPLE_REPORT.summary.posts,
      byType: EXAMPLE_REPORT.summary.byType,
      views: EXAMPLE_REPORT.summary.views,
      interactions: EXAMPLE_REPORT.summary.interactions,
      follows: EXAMPLE_REPORT.summary.follows,
    });
  });

  it('sierpień zgadza się z porównaniem w lib/report/example.ts', () => {
    const aug = summary(data.rows, '2026-08');
    expect(aug).toEqual(MAIN_TOTALS['2026-08']);
    expect(aug.views).toBe(EXAMPLE_REPORT.previous!.summary!.views);
    expect(aug.follows).toBe(EXAMPLE_REPORT.previous!.summary!.follows);
  });

  it('zakres od 1 sierpnia do 30 września, permalinki poprawne', () => {
    expect(warsawParts(data.range.from)).toEqual({ year: 2026, month: 8, day: 1 });
    expect(warsawParts(data.range.to)).toEqual({ year: 2026, month: 9, day: 30 });
    expect(data.rows.every((r) => r.permalink?.startsWith('https://www.instagram.com/'))).toBe(true);
  });

  it('trzy najlepsze publikacje września bez remisu (deterministyczne topPosts)', () => {
    const views = data.rows
      .filter((r) => warsawMonthKey(r.publishedAt) === '2026-09')
      .map((r) => r.views!)
      .sort((a, b) => b - a)
      .slice(0, 4);
    expect(new Set(views).size).toBe(4);
  });
});

describe('synthetic-privacy-canary.csv', () => {
  const result = load('synthetic-privacy-canary.csv');

  it('ma te same liczby co eksport główny', () => {
    const data = ok(result);
    expect(summary(data.rows, '2026-09')).toEqual(MAIN_TOTALS['2026-09']);
    expect(summary(data.rows, '2026-08')).toEqual(MAIN_TOTALS['2026-08']);
  });

  it('plik zawiera znacznik w pierwszej linii i w każdym opisie', () => {
    const text = fs.readFileSync(path.join(FIXTURES_DIR, 'synthetic-privacy-canary.csv'), 'utf8');
    const lines = text.split('\n');
    expect(lines[0]).toContain(PRIVACY_CANARY);
    expect(text.split(PRIVACY_CANARY).length - 1).toBeGreaterThan(59 * 2);
  });

  it('wynik parsera nie zawiera znacznika ani żadnego tekstu opisu (zasada 1)', () => {
    const json = JSON.stringify(result);
    expect(json).not.toContain(PRIVACY_CANARY);
    expect(json).not.toContain('sedno_canary_7f3a');
    expect(json).not.toContain('Konto kontrolne');
    for (const description of DESCRIPTIONS) {
      for (const fragment of description.split(/[\n.;,:"„”—]+/).map((s) => s.trim())) {
        if (fragment.length >= 8) expect(json, fragment).not.toContain(fragment);
      }
    }
  });

  it('jedyny tekst z pliku w wierszach to oczyszczony permalink', () => {
    const data = ok(result);
    for (const row of data.rows) {
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'string') {
          expect(['type', 'permalink']).toContain(key);
          if (key === 'type') expect(['reel', 'post', 'carousel', 'story', 'other']).toContain(value);
        }
      }
    }
  });
});

describe('synthetic-en-comma.csv (EN, przecinek, MM/DD/YYYY, „1,234”)', () => {
  const data = ok(load('synthetic-en-comma.csv'));

  it('sumy i typy', () => {
    expect(summary(data.rows)).toEqual({
      posts: EN_TOTALS.posts,
      byType: { reel: 5, post: 6, carousel: 3, story: 6 },
      views: EN_TOTALS.views,
      interactions: EN_TOTALS.interactions,
      follows: EN_TOTALS.follows,
    });
    expect(data.months).toEqual(['2026-09']);
    expect(data.fields).toEqual([...ALL_FIELDS]);
  });

  it('liczby z separatorem tysięcy i daty w kolejności miesiąc/dzień', () => {
    expect(Math.max(...data.rows.map((r) => r.views!))).toBeGreaterThan(999);
    expect(warsawParts(data.range.from)).toEqual({ year: 2026, month: 9, day: 1 });
    expect(warsawParts(data.range.to)).toEqual({ year: 2026, month: 9, day: 30 });
  });
});

describe('synthetic-tab.csv (tabulator, ISO z przesunięciem, twarde spacje)', () => {
  const data = ok(load('synthetic-tab.csv'));

  it('sumy, typy i pola z innymi nazwami kolumn', () => {
    expect(summary(data.rows)).toMatchObject({
      posts: TAB_TOTALS.posts,
      byType: { reel: 4, post: 4, carousel: 2, story: 2 },
      views: TAB_TOTALS.views,
      follows: TAB_TOTALS.follows,
    });
    expect(data.fields).toEqual([...ALL_FIELDS]);
    expect(data.rows.every((r) => r.reach !== null && r.likes !== null && r.permalink)).toBe(true);
  });

  it('przesunięcie +02:00 respektowane', () => {
    expect(data.rows[0]!.publishedAt.toISOString()).toBe('2026-09-02T13:23:00.000Z');
  });
});

describe('synthetic-windows-1250.csv (polski Excel)', () => {
  const data = ok(load('synthetic-windows-1250.csv'));

  it('ostrzeżenie o kodowaniu, polskie nagłówki rozpoznane, daty DD.MM.YYYY', () => {
    expect(data.warnings).toEqual([{ code: 'W_ENCODING_GUESSED' }]);
    expect(summary(data.rows)).toMatchObject({
      posts: CP1250_TOTALS.posts,
      byType: { reel: 3, post: 4, story: 3 },
      views: CP1250_TOTALS.views,
      follows: CP1250_TOTALS.follows,
    });
    expect(data.fields).toEqual(ALL_FIELDS.filter((f) => f !== 'permalink'));
    expect(warsawParts(data.range.from)).toEqual({ year: 2026, month: 9, day: 3 });
    expect(warsawParts(data.range.to)).toEqual({ year: 2026, month: 9, day: 28 });
  });
});

describe('synthetic-preamble.csv (opis nad nagłówkiem)', () => {
  it('pomija opis i czyta tabelę', () => {
    const data = ok(load('synthetic-preamble.csv'));
    expect(summary(data.rows)).toMatchObject({
      posts: PREAMBLE_TOTALS.posts,
      byType: { reel: 2, post: 3, story: 3 },
      views: PREAMBLE_TOTALS.views,
      follows: PREAMBLE_TOTALS.follows,
    });
    expect(data.fields).toEqual(['publishedAt', 'views', 'reach', 'likes', 'follows', 'type']);
  });
});

describe('synthetic-empty-cells.csv', () => {
  const data = ok(load('synthetic-empty-cells.csv'));

  it('puste komórki to null, nie 0; wiersze bez daty i wiersz sumy pominięte', () => {
    expect(
      data.rows.map((r) => [r.views, r.reach, r.likes, r.comments, r.shares, r.saves, r.follows]),
    ).toEqual([
      [1200, 900, 45, 3, 2, 5, 2],
      [null, 300, 12, null, 0, null, null],
      [250, null, null, null, null, null, null],
      [null, 700, 30, 4, 1, 2, 1],
      [400, 350, null, 1, 0, 0, 0],
      [null, 120, 0, 0, 0, 0, 0],
    ]);
    expect(data.rows.map((r) => r.type)).toEqual(['reel', 'post', 'story', 'reel', 'other', 'story']);
    expect(summary(data.rows).views).toBe(1850);
  });
});

describe('synthetic-incomplete-month.csv', () => {
  it('wrzesień kończy się 27 września', () => {
    const data = ok(load('synthetic-incomplete-month.csv'));
    expect(data.months).toEqual(['2026-08', '2026-09']);
    expect(warsawParts(data.range.from)).toEqual({ year: 2026, month: 8, day: 1 });
    expect(warsawParts(data.range.to)).toEqual({ year: 2026, month: 9, day: 27 });
    expect(summary(data.rows, '2026-08').views).toBe(4100);
    expect(summary(data.rows, '2026-09').views).toBe(3900);
  });
});

describe('synthetic-no-views.csv (zasięg, „Impressions”, bez „Views”)', () => {
  it('przyjmuje plik; wyświetlenia null, „Impressions” nie trafia do wyświetleń', () => {
    const data = ok(load('synthetic-no-views.csv'));
    expect(data.rows).toHaveLength(8);
    expect(data.rows.every((r) => r.views === null && r.reach !== null && r.reach > 0)).toBe(true);
    expect(data.fields).not.toContain('views');
    expect(data.fields).toContain('reach');
    expect(data.months).toEqual(['2025-03']);
  });
});

describe('synthetic-no-views-no-reach.csv', () => {
  it('E_MISSING_COLUMNS z brakującymi wyświetleniami i nagłówkami pliku', () => {
    expect(load('synthetic-no-views-no-reach.csv')).toEqual({
      ok: false,
      error: {
        code: 'E_MISSING_COLUMNS',
        missing: ['views'],
        headers: ['Publish time', 'Post type', 'Description', 'Impressions', 'Likes', 'Comments'],
      },
    });
  });
});

describe('synthetic-unknown-headers.csv (mapowanie ręczne)', () => {
  it('bez mapowania: brakuje obu pól', () => {
    expect(load('synthetic-unknown-headers.csv')).toEqual({
      ok: false,
      error: {
        code: 'E_MISSING_COLUMNS',
        missing: ['publishedAt', 'views'],
        headers: ['Kiedy', 'Ile razy obejrzano', 'Rodzaj', 'Notatka'],
      },
    });
  });

  it('z mapowaniem daty i wyświetleń (i typu) — czytelny', () => {
    const data = ok(
      load('synthetic-unknown-headers.csv', {
        Kiedy: 'publishedAt',
        'Ile razy obejrzano': 'views',
        Rodzaj: 'type',
      }),
    );
    expect(data.rows.map((r) => r.views)).toEqual([1500, 420, 310, 2210, 505, 275]);
    expect(data.rows.map((r) => r.type)).toEqual(['reel', 'post', 'story', 'reel', 'carousel', 'story']);
    expect(data.months).toEqual(['2026-09']);
    expect(JSON.stringify(data)).not.toContain('Notatka');
  });
});

describe('synthetic-dmy-dates.csv', () => {
  it('DD.MM.YYYY: 05.09 to 5 września, nie 9 maja', () => {
    const data = ok(load('synthetic-dmy-dates.csv'));
    expect(data.rows.map((r) => warsawParts(r.publishedAt))).toEqual([
      { year: 2026, month: 9, day: 5 },
      { year: 2026, month: 9, day: 9 },
      { year: 2026, month: 9, day: 13 },
      { year: 2026, month: 9, day: 28 },
    ]);
    expect(data.rows[0]!.publishedAt.toISOString()).toBe('2026-09-05T07:30:00.000Z');
  });
});

describe('synthetic-js-permalink.csv', () => {
  it('przepuszcza wyłącznie https://www.instagram.com/…', () => {
    const data = ok(load('synthetic-js-permalink.csv'));
    expect(data.rows.map((r) => r.permalink)).toEqual(PERMALINK_CASES.map(([, expected]) => expected));
    expect(JSON.stringify(data)).not.toMatch(/javascript|evil|data:|onmouseover|http:/i);
    // Wiersze z odrzuconym linkiem nie mają klucza permalink.
    expect(data.rows.filter((r) => 'permalink' in r)).toHaveLength(2);
  });
});

describe('pliki błędne', () => {
  it.each([
    ['synthetic-empty.csv', { code: 'E_EMPTY' }],
    ['synthetic-header-only.csv', { code: 'E_EMPTY' }],
    ['synthetic-binary.csv', { code: 'E_NOT_CSV' }],
    ['synthetic-not-csv.txt', { code: 'E_NOT_CSV' }],
  ])('%s → %j', (name, error) => {
    expect(load(name)).toEqual({ ok: false, error });
  });
});

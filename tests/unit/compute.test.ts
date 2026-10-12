import { describe, expect, it } from 'vitest';
import type { FieldKey, ParsedExport, PostRow } from '@/lib/csv/types';
import { monthStart, monthEnd } from '@/lib/dates';
import { warsawMonthKey } from '@/lib/i18n/pl';
import {
  computeReport,
  headlineFor,
  isReportPermalink,
  pickDefaultKeyMetric,
  pickTopPosts,
  postsSuggestion,
  resolvePrevious,
  stripEmoji,
  summarizeMonth,
  type ComputeInput,
  type ComputeSuccess,
} from '@/lib/report/compute';
import { reportDataSchema, topPostSchema, type ReportData } from '@/lib/report/types';

/* ------------------------------------------------------------------ pomocnicze */

const NOW = new Date('2026-10-12T10:00:00+02:00');
const NBSP = ' ';

const ALL_FIELDS: FieldKey[] = [
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
];

function row(at: string, over: Partial<PostRow> = {}): PostRow {
  return {
    publishedAt: new Date(at),
    type: 'post',
    views: null,
    reach: null,
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    follows: null,
    ...over,
  };
}

function parsedOf(
  rows: PostRow[],
  fields: FieldKey[] = ALL_FIELDS,
  range?: { from: Date; to: Date },
): ParsedExport {
  const times = rows.map((r) => r.publishedAt.getTime());
  return {
    rows,
    range: range ?? { from: new Date(Math.min(...times)), to: new Date(Math.max(...times)) },
    months: [...new Set(rows.map((r) => warsawMonthKey(r.publishedAt)))].sort(),
    warnings: [],
    fields,
  };
}

function input(parsed: ParsedExport, over: Partial<ComputeInput> = {}): ComputeInput {
  return {
    parsed,
    month: '2026-09',
    now: NOW,
    client: { name: 'Studio Lumi' },
    author: { name: 'Kadr Social' },
    branding: 'sedno-footer',
    actions: { book: 23, call: 9, directions: 14 },
    ...over,
  };
}

/** Wynik musi być sukcesem i przejść reportDataSchema. */
function success(i: ComputeInput): ComputeSuccess {
  const result = computeReport(i);
  if (!result.ok) throw new Error(`Oczekiwano raportu, jest błąd ${result.error.code}`);
  expect(() => reportDataSchema.parse(result.report)).not.toThrow();
  return result;
}

const codes = (r: ComputeSuccess) => r.warnings.map((w) => w.code);

/** Pełny wrzesień 2026 (dane przykładowe). Wyświetlenia: 7400, w tym pusta komórka. */
function september(): PostRow[] {
  return [
    row('2026-09-01T09:00:00+02:00', {
      type: 'reel',
      views: 1200,
      reach: 900,
      likes: 50,
      comments: 5,
      shares: 3,
      saves: 10,
      follows: 2,
      permalink: 'https://www.instagram.com/reel/AAA111/',
    }),
    row('2026-09-05T18:00:00+02:00', {
      type: 'post',
      views: 800,
      reach: 700,
      likes: 30,
      comments: 2,
      saves: 4,
      follows: 1,
    }),
    row('2026-09-10T12:00:00+02:00', {
      type: 'carousel',
      views: 2500,
      reach: 2000,
      likes: 120,
      comments: 10,
      shares: 8,
      saves: 30,
      follows: 5,
      permalink: 'https://www.instagram.com/p/BBB222/',
    }),
    row('2026-09-15T20:00:00+02:00', { type: 'story', views: 400, reach: 380 }),
    row('2026-09-20T08:00:00+02:00', {
      type: 'reel',
      views: 2500,
      reach: 2100,
      likes: 90,
      comments: 7,
      shares: 4,
      saves: 12,
      follows: 3,
    }),
    row('2026-09-30T21:00:00+02:00', { type: 'story', reach: 300 }),
  ];
}

/** Sierpień 2026: dwie publikacje, druga tuż przed północą 31 sierpnia (czas warszawski). */
function august(): PostRow[] {
  return [
    row('2026-08-02T10:00:00+02:00', { type: 'post', views: 3000, reach: 2500, likes: 10, follows: 3 }),
    row('2026-08-31T23:30:00+02:00', {
      type: 'reel',
      views: 500,
      reach: 450,
      likes: 5,
      saves: 2,
      follows: 0,
    }),
  ];
}

/* ------------------------------------------------------------------ summarizeMonth */

describe('summarizeMonth', () => {
  it('liczy publikacje, typy, wyświetlenia, interakcje i obserwujących z miesiąca M', () => {
    const s = summarizeMonth([...august(), ...september()], '2026-09', ALL_FIELDS);
    expect(s.posts).toBe(6);
    expect(s.byType).toEqual({ reel: 2, post: 1, carousel: 1, story: 2 });
    expect(Object.keys(s.byType)).toEqual(['reel', 'post', 'carousel', 'story']);
    expect(s.views).toBe(7400);
    expect(s.interactions).toBe(50 + 5 + 3 + 10 + (30 + 2 + 4) + (120 + 10 + 8 + 30) + (90 + 7 + 4 + 12));
    expect(s.follows).toBe(11);
  });

  it('granice miesiąca w czasie warszawskim (nie UTC)', () => {
    const rows = [
      row('2026-08-31T23:30:00+02:00', { views: 1 }), // 21:30Z — sierpień
      row('2026-09-01T00:00:00+02:00', { views: 10 }), // 22:00Z 31.08 — już wrzesień
      row('2026-09-30T23:59:59.999+02:00', { views: 100 }), // ostatnia chwila września
      row('2026-10-01T00:00:00+02:00', { views: 10_000 }), // 22:00Z 30.09 — już październik
      row('2026-10-01T00:30:00+02:00', { views: 1000 }), // 22:30Z 30.09 — październik
    ];
    expect(summarizeMonth(rows, '2026-09', ALL_FIELDS)).toMatchObject({ posts: 2, views: 110 });
    expect(summarizeMonth(rows, '2026-08', ALL_FIELDS)).toMatchObject({ posts: 1, views: 1 });
    expect(summarizeMonth(rows, '2026-10', ALL_FIELDS)).toMatchObject({ posts: 2, views: 11_000 });
  });

  it('pusta komórka w istniejącej kolumnie to 0 w sumie, a brak kolumny to null', () => {
    const rows = [
      row('2026-09-03T12:00:00+02:00', { views: 100, likes: 4, follows: 2 }),
      row('2026-09-04T12:00:00+02:00'),
    ];
    const s = summarizeMonth(rows, '2026-09', ['publishedAt', 'views', 'likes', 'follows']);
    expect(s.views).toBe(100);
    expect(s.interactions).toBe(4);
    expect(s.follows).toBe(2);

    const without = summarizeMonth(rows, '2026-09', ['publishedAt', 'views']);
    expect(without.interactions).toBeNull();
    expect(without.follows).toBeNull();
  });

  it('kolumna bez żadnej wartości w M to brak danych (null), nie 0', () => {
    const rows = [
      row('2026-08-20T12:00:00+02:00', { views: 50, likes: 3, follows: 1 }),
      row('2026-09-03T12:00:00+02:00', { type: 'story' }),
      row('2026-09-04T12:00:00+02:00', { type: 'story' }),
    ];
    const s = summarizeMonth(rows, '2026-09', ALL_FIELDS);
    expect(s).toEqual({
      posts: 2,
      byType: { story: 2 },
      views: null,
      interactions: null,
      follows: null,
      topPosts: [],
    });
    // Wartości z innego miesiąca nie liczą się jako dane z M.
    expect(summarizeMonth(rows, '2026-08', ALL_FIELDS)).toMatchObject({
      views: 50,
      interactions: 3,
      follows: 1,
    });
  });

  it('obserwujący: kolumna z zerami → 0, brak kolumny → null', () => {
    const rows = [row('2026-09-03T12:00:00+02:00', { views: 5, follows: 0 })];
    expect(summarizeMonth(rows, '2026-09', ['publishedAt', 'views', 'follows']).follows).toBe(0);
    expect(summarizeMonth(rows, '2026-09', ['publishedAt', 'views']).follows).toBeNull();
  });

  it('interakcje z części kolumn (brakujące pola pomijamy)', () => {
    const rows = [
      row('2026-09-03T12:00:00+02:00', { views: 1, likes: 10 }),
      row('2026-09-04T12:00:00+02:00', { views: 1, saves: 5 }),
      row('2026-09-05T12:00:00+02:00', { views: 1, likes: 1, saves: 1 }),
    ];
    const s = summarizeMonth(rows, '2026-09', ['publishedAt', 'views', 'likes', 'saves']);
    expect(s.interactions).toBe(17);
  });

  it('nigdy nie sumuje zasięgu: plik tylko z zasięgiem daje wyświetlenia = null', () => {
    const rows = [
      row('2026-09-03T12:00:00+02:00', { reach: 1111, likes: 1 }),
      row('2026-09-04T12:00:00+02:00', { reach: 2222, likes: 2 }),
      row('2026-09-05T12:00:00+02:00', { reach: 3333, likes: 3 }),
    ];
    const s = summarizeMonth(rows, '2026-09', ['publishedAt', 'reach', 'likes', 'type']);
    expect(s.views).toBeNull();
    expect(s.interactions).toBe(6);
    // Bez kolumny wyświetleń nie ma czego uszeregować.
    expect(s.topPosts).toEqual([]);
    expect(JSON.stringify(s)).not.toContain('6666');
    expect(JSON.stringify(s)).not.toContain('reach');
  });

  it('wartości spoza zakresu traktuje defensywnie (ujemne → brak, ułamki → zaokrąglenie)', () => {
    const rows = [
      row('2026-09-03T12:00:00+02:00', { views: -5 }),
      row('2026-09-04T12:00:00+02:00', { views: 10.4 }),
      row('2026-09-05T12:00:00+02:00', { views: Number.NaN }),
    ];
    expect(summarizeMonth(rows, '2026-09', ALL_FIELDS).views).toBe(10);
  });

  it('wartość większa niż dopuszcza schemat (np. identyfikator przypisany jako wyświetlenia) to brak danych', () => {
    const ids = [
      row('2026-09-03T12:00:00+02:00', { views: 17912345678901234, follows: 2_000_000_000 }),
      row('2026-09-30T12:00:00+02:00', { views: 17912345678901300, follows: 1 }),
    ];
    const r = success(input(parsedOf(ids)));
    expect(r.report.summary.views).toBeNull();
    expect(r.report.summary.follows).toBe(1);
    expect(r.report.summary.topPosts).toEqual([]);
  });
});

/* ------------------------------------------------------------------ topPosts */

describe('najlepsze publikacje', () => {
  it('trzy o największej liczbie wyświetleń, remis → wcześniejsza data', () => {
    const top = summarizeMonth(september(), '2026-09', ALL_FIELDS).topPosts;
    expect(top).toEqual([
      {
        publishedAt: '2026-09-10T10:00:00.000Z',
        type: 'carousel',
        views: 2500,
        interactions: 168,
        permalink: 'https://www.instagram.com/p/BBB222/',
      },
      { publishedAt: '2026-09-20T06:00:00.000Z', type: 'reel', views: 2500, interactions: 113 },
      {
        publishedAt: '2026-09-01T07:00:00.000Z',
        type: 'reel',
        views: 1200,
        interactions: 68,
        permalink: 'https://www.instagram.com/reel/AAA111/',
      },
    ]);
  });

  it('brak wyświetleń na końcu; interakcje null, gdy brak wszystkich czterech pól', () => {
    const top = pickTopPosts([
      row('2026-09-02T12:00:00+02:00', { views: null, likes: 4 }),
      row('2026-09-01T12:00:00+02:00', { views: null }),
      row('2026-09-03T12:00:00+02:00', { views: 0 }),
    ]);
    expect(top.map((p) => [p.views, p.interactions])).toEqual([
      [0, null],
      [null, null],
      [null, 4],
    ]);
  });

  it('zawiera tylko datę, typ, wyświetlenia, interakcje i permalink — nigdy innych pól wiersza', () => {
    const leaky = {
      ...row('2026-09-03T12:00:00+02:00', { views: 9, reach: 7, likes: 1 }),
      description: 'SEDNO-PRIVACY-CANARY-7f3a',
    } as unknown as PostRow;
    const [post] = pickTopPosts([leaky]);
    expect(Object.keys(post!).sort()).toEqual(['interactions', 'publishedAt', 'type', 'views']);
    const result = success(input(parsedOf([leaky])));
    expect(JSON.stringify(result)).not.toContain('SEDNO-PRIVACY-CANARY-7f3a');
  });

  it('znacznik prywatności w typie publikacji ani w dodatkowych polach wejścia nie trafia do wyniku', () => {
    const CANARY = 'SEDNO-PRIVACY-CANARY-7f3a';
    const extra = { description: CANARY, raw: [CANARY] };
    const leakyRow = (rows: PostRow[]) => [
      ...rows,
      row('2026-09-03T12:00:00+02:00', { views: 9, likes: 1, type: CANARY as PostRow['type'] }),
      { ...row('2026-09-30T12:00:00+02:00', { views: 5 }), ...extra } as PostRow,
    ];
    const common: Partial<ComputeInput> = {
      actions: { book: 3, call: 1, directions: 0, ...extra } as ComputeInput['actions'],
      client: { name: 'Studio Lumi', ...extra } as ComputeInput['client'],
      author: { name: 'Kadr Social', ...extra } as ComputeInput['author'],
    };
    // Każde źródło M−1 osobno: plik, zapisany raport, pola ręczne.
    const variants: [PostRow[], Partial<ComputeInput>, string][] = [
      [august(), {}, 'file'],
      [
        [],
        {
          history: {
            summary: { views: 10, ...extra } as Partial<ReportData['summary']>,
            actions: { book: 1, ...extra } as Partial<ReportData['actions']>,
          },
        },
        'history',
      ],
      [
        [],
        {
          manualPrevious: {
            views: 2,
            ...extra,
            actions: { call: 4, ...extra } as Partial<ReportData['actions']>,
          } as ComputeInput['manualPrevious'],
        },
        'manual',
      ],
    ];
    for (const [previousRows, over, source] of variants) {
      const result = success(input(parsedOf(leakyRow(previousRows)), { ...common, ...over }));
      expect(result.report.previous?.source).toBe(source);
      expect(result.report.summary.byType).toEqual({ post: 1, other: 1 });
      expect(JSON.stringify(result)).not.toContain(CANARY);
      expect(JSON.stringify(result)).not.toContain('description');
    }
  });

  it('permalink spoza schematu raportu jest pomijany', () => {
    const [ok, bad, http] = pickTopPosts([
      row('2026-09-01T12:00:00+02:00', { views: 3, permalink: 'https://www.instagram.com/p/X1/' }),
      row('2026-09-02T12:00:00+02:00', { views: 2, permalink: 'https://www.instagram.com/p/X1/#komentarz' }),
      row('2026-09-03T12:00:00+02:00', { views: 1, permalink: 'javascript:alert(1)' }),
    ]);
    expect(ok!.permalink).toBe('https://www.instagram.com/p/X1/');
    expect(bad).not.toHaveProperty('permalink');
    expect(http).not.toHaveProperty('permalink');
  });

  it('isReportPermalink zgadza się ze schematem raportu', () => {
    const urls = [
      'https://www.instagram.com/p/ABC123/',
      'https://www.instagram.com/reel/C-x_y.z/?igsh=abc%3D&utm=1',
      'https://www.instagram.com/',
      'https://www.instagram.com/p/x/#frag',
      'https://www.instagram.com/p/ąę/',
      'https://www.instagram.com.evil.example/p/x/',
      'https://instagram.com/p/x/',
      'http://www.instagram.com/p/x/',
      'javascript:alert(1)',
      ' https://www.instagram.com/p/x/',
      `https://www.instagram.com/${'a'.repeat(274)}`,
      `https://www.instagram.com/${'a'.repeat(275)}`,
    ];
    for (const url of urls) {
      expect(isReportPermalink(url), url).toBe(topPostSchema.shape.permalink.safeParse(url).success);
    }
  });
});

/* ------------------------------------------------------------------ kluczowa liczba */

describe('pickDefaultKeyMetric', () => {
  it.each([
    [{ book: 23, call: 9, directions: 14 }, 'book'],
    [{ book: 5, call: 9, directions: 9 }, 'call'],
    [{ book: 7, call: 7, directions: 7 }, 'book'],
    [{ book: 3, call: 1, directions: 3 }, 'book'],
    [{ book: null, call: 0, directions: 4 }, 'directions'],
    [{ book: 0, call: 0, directions: 0 }, 'views'],
    [{ book: null, call: null, directions: null }, 'views'],
    [{ book: 0, call: null, directions: 0 }, 'views'],
  ] as const)('%o → %s', (actions, expected) => {
    expect(pickDefaultKeyMetric(actions)).toBe(expected);
  });
});

/* ------------------------------------------------------------------ tytuł */

describe('headlineFor', () => {
  const cases: [number, string, string, string, string][] = [
    [
      0,
      'W tym miesiącu nikt nie kliknął »Zarezerwuj«',
      'W tym miesiącu nikt nie kliknął »Zadzwoń«',
      'W tym miesiącu nikt nie kliknął »Wyznacz trasę«',
      '0 wyświetleń we wrześniu',
    ],
    [
      1,
      '1 osoba chciała się umówić',
      '1 osoba zadzwoniła',
      '1 osoba sprawdziła dojazd',
      '1 wyświetlenie we wrześniu',
    ],
    [
      2,
      '2 osoby chciały się umówić',
      '2 osoby zadzwoniły',
      '2 osoby sprawdziły dojazd',
      '2 wyświetlenia we wrześniu',
    ],
    [
      5,
      '5 osób chciało się umówić',
      '5 osób zadzwoniło',
      '5 osób sprawdziło dojazd',
      '5 wyświetleń we wrześniu',
    ],
    [
      12,
      '12 osób chciało się umówić',
      '12 osób zadzwoniło',
      '12 osób sprawdziło dojazd',
      '12 wyświetleń we wrześniu',
    ],
    [
      22,
      '22 osoby chciały się umówić',
      '22 osoby zadzwoniły',
      '22 osoby sprawdziły dojazd',
      '22 wyświetlenia we wrześniu',
    ],
    [
      25,
      '25 osób chciało się umówić',
      '25 osób zadzwoniło',
      '25 osób sprawdziło dojazd',
      '25 wyświetleń we wrześniu',
    ],
    [
      112,
      '112 osób chciało się umówić',
      '112 osób zadzwoniło',
      '112 osób sprawdziło dojazd',
      '112 wyświetleń we wrześniu',
    ],
    [
      1234,
      '1234 osoby chciały się umówić',
      '1234 osoby zadzwoniły',
      '1234 osoby sprawdziły dojazd',
      '1234 wyświetlenia we wrześniu',
    ],
  ];

  it.each(cases)('n = %i', (n, book, call, directions, views) => {
    expect(headlineFor('book', n, '2026-09')).toBe(book);
    expect(headlineFor('call', n, '2026-09')).toBe(call);
    expect(headlineFor('directions', n, '2026-09')).toBe(directions);
    expect(headlineFor('views', n, '2026-09')).toBe(views);
  });

  it('wyświetlenia z twardą spacją i miejscownikiem miesiąca', () => {
    expect(headlineFor('views', 12480, '2026-09')).toBe(`12${NBSP}480 wyświetleń we wrześniu`);
    expect(headlineFor('views', 12480, '2026-10')).toBe(`12${NBSP}480 wyświetleń w październiku`);
    expect(headlineFor('views', 1840, '2026-02')).toBe('1840 wyświetleń w lutym');
  });

  it('brak wartości → „Raport za {miesiąc}”', () => {
    expect(headlineFor('views', null, '2026-09')).toBe('Raport za wrzesień');
    expect(headlineFor('book', null, '2026-10')).toBe('Raport za październik');
  });
});

/* ------------------------------------------------------------------ podpowiedź „Co zrobiliśmy” */

describe('postsSuggestion', () => {
  it('stała kolejność typów, tylko niezerowe', () => {
    expect(postsSuggestion({ reel: 8, post: 9, story: 14 })).toBe('8 rolek, 9 postów, 14 relacji');
    expect(postsSuggestion({ story: 2, carousel: 1, reel: 1 })).toBe('1 rolka, 1 karuzela, 2 relacje');
    expect(postsSuggestion({ other: 5, post: 0 })).toBe('5 publikacji');
    expect(postsSuggestion({ post: 22, carousel: 12 })).toBe('22 posty, 12 karuzel');
    expect(postsSuggestion({})).toBe('');
  });

  it('w wyniku computeReport', () => {
    expect(success(input(parsedOf(september()))).postsSuggestion).toBe(
      '2 rolki, 1 post, 1 karuzela, 2 relacje',
    );
  });
});

/* ------------------------------------------------------------------ poprzedni miesiąc */

describe('resolvePrevious', () => {
  const fileSummary = { posts: 2, views: 3500, interactions: 17, follows: 3 };

  it('brak źródeł → undefined', () => {
    expect(resolvePrevious({})).toBeUndefined();
    expect(resolvePrevious({ file: null, history: null, manual: {} })).toBeUndefined();
    expect(
      resolvePrevious({
        history: { summary: { views: null }, actions: { book: null } },
        manual: { views: null, follows: null, actions: { call: null } },
      }),
    ).toBeUndefined();
  });

  it('plik ma pierwszeństwo przed zapisanym raportem i polami ręcznymi', () => {
    expect(
      resolvePrevious({
        file: fileSummary,
        history: { summary: { views: 1 } },
        manual: { views: 2, follows: 3 },
      }),
    ).toEqual({ source: 'file', summary: fileSummary });
  });

  it('zapisany raport ma pierwszeństwo przed polami ręcznymi (podsumowanie i efekty)', () => {
    expect(
      resolvePrevious({
        history: { summary: { views: 9000, follows: 40 }, actions: { book: 17, call: 11, directions: 10 } },
        manual: { views: 1, follows: 1, actions: { book: 1 } },
      }),
    ).toEqual({
      source: 'history',
      summary: { views: 9000, follows: 40 },
      actions: { book: 17, call: 11, directions: 10 },
    });
  });

  it('z zapisanego raportu bierze tylko liczby do porównań (bez byType i topPosts) i pomija null', () => {
    expect(
      resolvePrevious({
        history: {
          summary: {
            posts: 20,
            views: 9000,
            interactions: null,
            follows: 40,
            byType: { reel: 4 },
            topPosts: [{ publishedAt: '2026-08-01T10:00:00.000Z', type: 'reel', views: 1, interactions: 1 }],
          },
          actions: { book: 17, call: null },
        },
      }),
    ).toEqual({ source: 'history', summary: { posts: 20, views: 9000, follows: 40 }, actions: { book: 17 } });
  });

  it('efekty z raportu, podsumowanie z pól ręcznych → źródłem jest źródło podsumowania', () => {
    expect(
      resolvePrevious({ history: { actions: { book: 17 } }, manual: { views: 8000, follows: null } }),
    ).toEqual({ source: 'manual', summary: { views: 8000 }, actions: { book: 17 } });
  });

  it('podsumowanie z pliku, efekty z raportu → źródło „file”', () => {
    expect(resolvePrevious({ file: fileSummary, history: { actions: { call: 4 } } })).toEqual({
      source: 'file',
      summary: fileSummary,
      actions: { call: 4 },
    });
  });

  it('same efekty → źródło efektów', () => {
    expect(resolvePrevious({ history: { actions: { book: 3 } } })).toEqual({
      source: 'history',
      actions: { book: 3 },
    });
    expect(resolvePrevious({ manual: { actions: { directions: 0 } } })).toEqual({
      source: 'manual',
      actions: { directions: 0 },
    });
  });
});

describe('computeReport — poprzedni miesiąc', () => {
  it('(1) z tego samego pliku, gdy obejmuje M−1', () => {
    const r = success(input(parsedOf([...august(), ...september()])));
    expect(r.previousFromFile).toEqual({ posts: 2, views: 3500, interactions: 17, follows: 3 });
    expect(r.report.previous).toEqual({
      source: 'file',
      summary: { posts: 2, views: 3500, interactions: 17, follows: 3 },
    });
  });

  it('plik bez kolumny obserwujących: previousFromFile.follows = null, w previous brak klucza', () => {
    const fields = ALL_FIELDS.filter((f) => f !== 'follows');
    const r = success(input(parsedOf([...august(), ...september()], fields)));
    expect(r.previousFromFile?.follows).toBeNull();
    expect(r.report.summary.follows).toBeNull();
    expect(r.report.previous?.summary).not.toHaveProperty('follows');
  });

  it('(1)+(2) plik i efekty z zapisanego raportu; ręczne wyświetlenia ignorowane', () => {
    const r = success(
      input(parsedOf([...august(), ...september()]), {
        history: { actions: { book: 17, call: 11, directions: 10 } },
        manualPrevious: { views: 1, actions: { book: 99 } },
      }),
    );
    expect(r.report.previous).toEqual({
      source: 'file',
      summary: { posts: 2, views: 3500, interactions: 17, follows: 3 },
      actions: { book: 17, call: 11, directions: 10 },
    });
  });

  it('(1)+(3) plik i efekty z pól ręcznych', () => {
    const r = success(
      input(parsedOf([...august(), ...september()]), { manualPrevious: { actions: { book: 12 } } }),
    );
    expect(r.report.previous).toMatchObject({ source: 'file', actions: { book: 12 } });
  });

  it('(2) z zapisanego raportu, gdy plik nie obejmuje M−1', () => {
    const r = success(
      input(parsedOf(september()), {
        history: { summary: { views: 9000, follows: 40 }, actions: { book: 17 } },
        manualPrevious: { views: 5, actions: { book: 5 } },
      }),
    );
    expect(r.previousFromFile).toBeNull();
    expect(r.report.previous).toEqual({
      source: 'history',
      summary: { views: 9000, follows: 40 },
      actions: { book: 17 },
    });
  });

  it('(3) z pól ręcznych', () => {
    const r = success(
      input(parsedOf(september()), {
        manualPrevious: { views: 11420, follows: 51, actions: { book: 17, call: 11, directions: 10 } },
      }),
    );
    expect(r.report.previous).toEqual({
      source: 'manual',
      summary: { views: 11420, follows: 51 },
      actions: { book: 17, call: 11, directions: 10 },
    });
  });

  it('(4) brak danych → bez previous', () => {
    const r = success(input(parsedOf(september()), { manualPrevious: { views: null, actions: {} } }));
    expect(r.report).not.toHaveProperty('previous');
    expect(r.previousFromFile).toBeNull();
  });

  it('lista miesięcy z M−1 bez publikacji z M−1 nie daje zer w porównaniu', () => {
    const parsed = { ...parsedOf(september()), months: ['2026-08', '2026-09'] };
    const r = success(input(parsed));
    expect(r.previousFromFile).toBeNull();
    expect(r.report).not.toHaveProperty('previous');
    // Kolejne źródło (pola ręczne) nadal działa.
    expect(success(input(parsed, { manualPrevious: { views: 11420 } })).report.previous).toEqual({
      source: 'manual',
      summary: { views: 11420 },
    });
  });

  it('M−1 z pliku bez wartości w kolumnie obserwujących: brak klucza zamiast 0', () => {
    const augustNoFollows = august().map((r) => ({ ...r, follows: null }));
    const r = success(input(parsedOf([...augustNoFollows, ...september()])));
    expect(r.previousFromFile).toEqual({ posts: 2, views: 3500, interactions: 17, follows: null });
    expect(r.report.previous).toEqual({
      source: 'file',
      summary: { posts: 2, views: 3500, interactions: 17 },
    });
  });
});

/* ------------------------------------------------------------------ kluczowa liczba i tytuł w raporcie */

describe('computeReport — kluczowa liczba i tytuł', () => {
  const parsed = parsedOf(september());

  it('domyślnie efekt o największej wartości', () => {
    const r = success(input(parsed));
    expect(r.defaultKeyMetric).toBe('book');
    expect(r.keyMetricFallback).toBe(false);
    expect(r.report.keyMetric).toBe('book');
    expect(r.report.headline).toBe('23 osoby chciały się umówić');
    expect(r.generatedHeadline).toBe('23 osoby chciały się umówić');
  });

  it('wybór użytkownika nadpisuje domyślny', () => {
    const r = success(input(parsed, { keyMetric: 'call' }));
    expect(r.defaultKeyMetric).toBe('book');
    expect(r.report.keyMetric).toBe('call');
    expect(r.report.headline).toBe('9 osób zadzwoniło');
  });

  it('wybór efektu bez wartości ustępuje domyślnemu', () => {
    const r = success(
      input(parsed, { actions: { book: 3, call: 5, directions: null }, keyMetric: 'directions' }),
    );
    expect(r.report.keyMetric).toBe('call');
    expect(r.report.headline).toBe('5 osób zadzwoniło');
  });

  it('wybór efektu z wartością 0 → tytuł „nikt nie kliknął”', () => {
    const r = success(input(parsed, { actions: { book: 3, call: 0, directions: 1 }, keyMetric: 'call' }));
    expect(r.report.headline).toBe('W tym miesiącu nikt nie kliknął »Zadzwoń«');
  });

  it('wybór wyświetleń', () => {
    const r = success(input(parsed, { keyMetric: 'views' }));
    expect(r.report.keyMetric).toBe('views');
    expect(r.report.headline).toBe('7400 wyświetleń we wrześniu');
  });

  it('wszystkie efekty 0 lub brak → wyświetlenia i podpowiedź w edytorze', () => {
    const r = success(input(parsed, { actions: { book: 0, call: null, directions: 0 } }));
    expect(r.defaultKeyMetric).toBe('views');
    expect(r.keyMetricFallback).toBe(true);
    expect(r.report.keyMetric).toBe('views');
    expect(r.report.headline).toBe('7400 wyświetleń we wrześniu');
  });

  it('bez efektów i bez wyświetleń → „Raport za wrzesień”', () => {
    const reachOnly = parsedOf(
      [row('2026-09-03T12:00:00+02:00', { reach: 1111 }), row('2026-09-30T20:00:00+02:00', { reach: 2222 })],
      ['publishedAt', 'reach'],
    );
    const r = success(input(reachOnly, { actions: { book: null, call: null, directions: null } }));
    expect(r.report.summary.views).toBeNull();
    expect(r.report.headline).toBe('Raport za wrzesień');
    expect(JSON.stringify(r)).not.toContain('3333');
  });

  it('kolumna wyświetleń bez wartości w M → „Raport za wrzesień”, nie „0 wyświetleń”', () => {
    const stories = parsedOf([
      row('2026-09-03T12:00:00+02:00', { type: 'story' }),
      row('2026-09-30T20:00:00+02:00', { type: 'story' }),
    ]);
    const r = success(input(stories, { actions: { book: 0, call: null, directions: 0 } }));
    expect(r.report.summary.views).toBeNull();
    expect(r.report.summary.follows).toBeNull();
    expect(r.keyMetricFallback).toBe(true);
    expect(r.report.headline).toBe('Raport za wrzesień');
  });

  it('efekty spoza zakresu (NaN, ujemne, nieskończone) to brak danych; ułamek zaokrąglony', () => {
    const r = success(
      input(parsed, {
        actions: { book: Number.NaN, call: -3, directions: Number.POSITIVE_INFINITY },
        keyMetric: 'book',
      }),
    );
    expect(r.report.actions).toEqual({ book: null, call: null, directions: null });
    expect(r.report.keyMetric).toBe('views');
    expect(r.report.headline).toBe('7400 wyświetleń we wrześniu');

    const rounded = success(input(parsed, { actions: { book: 2.4, call: null, directions: null } }));
    expect(rounded.report.actions.book).toBe(2);
    expect(rounded.report.headline).toBe('2 osoby chciały się umówić');
  });

  it('tytuł użytkownika (przycięty) nadpisuje szablon; pusty → szablon', () => {
    expect(success(input(parsed, { headline: '  Najlepszy wrzesień salonu  ' })).report.headline).toBe(
      'Najlepszy wrzesień salonu',
    );
    const blank = success(input(parsed, { headline: '   ' }));
    expect(blank.report.headline).toBe('23 osoby chciały się umówić');
    expect(blank.generatedHeadline).toBe('23 osoby chciały się umówić');
  });
});

/* ------------------------------------------------------------------ ostrzeżenia */

describe('computeReport — niepełny miesiąc', () => {
  const rows = september().filter((r) => r.publishedAt < new Date('2026-09-28T00:00:00+02:00'));
  rows.push(row('2026-09-27T19:00:00+02:00', { views: 10 }));

  it('wrzesień kończy się 27 września, teraz 12 października → 27 z 30 dni', () => {
    const r = success(input(parsedOf(rows)));
    expect(r.warnings).toEqual([
      { code: 'W_INCOMPLETE_MONTH', params: { date: '2026-09-27T17:00:00.000Z', days: 27, monthDays: 30 } },
    ]);
    expect(r.report.flags).toEqual({ incompleteDays: 27 });
    expect(r.report.dataRange.to).toBe('2026-09-27T17:00:00.000Z');
  });

  it('incompleteNote = false: ostrzeżenie zostaje, przypisu nie ma', () => {
    const r = success(input(parsedOf(rows), { incompleteNote: false }));
    expect(codes(r)).toEqual(['W_INCOMPLETE_MONTH']);
    expect(r.report.flags).toEqual({});
  });

  it('dane z ostatniego dnia miesiąca → pełny miesiąc', () => {
    expect(success(input(parsedOf(september()))).warnings).toEqual([]);
    const justAfterMidnight = [...rows, row('2026-09-30T00:10:00+02:00', { views: 1 })];
    expect(success(input(parsedOf(justAfterMidnight))).warnings).toEqual([]);
  });

  it('ostatnia publikacja tuż przed północą 29 września → 29 z 30 dni', () => {
    const r = success(input(parsedOf([...rows, row('2026-09-29T23:50:00+02:00', { views: 1 })])));
    expect(r.warnings[0]?.params).toMatchObject({ days: 29, monthDays: 30 });
  });

  it('plik sięga dalej niż M → pełny miesiąc', () => {
    const r = success(input(parsedOf([...rows, row('2026-10-05T12:00:00+02:00', { views: 1 })])));
    expect(r.warnings).toEqual([]);
    expect(r.report.dataRange.to).toBe(monthEnd('2026-09').toISOString());
  });

  it('zakres z parsera szerszy niż publikacje rozstrzyga o kompletności', () => {
    const r = success(
      input(
        parsedOf(rows, ALL_FIELDS, {
          from: new Date('2026-09-01T00:00:00+02:00'),
          to: new Date('2026-09-30T23:59:00+02:00'),
        }),
      ),
    );
    expect(r.warnings).toEqual([]);
  });

  it('dzień zmiany czasu (31 października 2021 ma 25 godzin)', () => {
    const now = new Date('2021-11-15T12:00:00+01:00');
    const base = row('2021-10-05T12:00:00+02:00', { views: 1 });
    const complete = success(
      input(parsedOf([base, row('2021-10-31T00:30:00+02:00', { views: 1 })]), { month: '2021-10', now }),
    );
    expect(codes(complete)).not.toContain('W_INCOMPLETE_MONTH');

    const incomplete = success(
      input(parsedOf([base, row('2021-10-30T23:30:00+02:00', { views: 1 })]), { month: '2021-10', now }),
    );
    expect(incomplete.warnings[0]).toEqual({
      code: 'W_INCOMPLETE_MONTH',
      params: { date: '2021-10-30T21:30:00.000Z', days: 30, monthDays: 31 },
    });
  });
});

describe('computeReport — miesiąc w toku', () => {
  const october = [
    row('2026-10-01T09:00:00+02:00', { type: 'reel', views: 900 }),
    row('2026-10-11T18:00:00+02:00', { type: 'post', views: 300 }),
  ];

  it('teraz 12 października, M = październik → W_MONTH_IN_PROGRESS, bez W_INCOMPLETE_MONTH', () => {
    const r = success(input(parsedOf(october), { month: '2026-10' }));
    expect(r.warnings).toEqual([
      { code: 'W_MONTH_IN_PROGRESS', params: { date: '2026-10-11T16:00:00.000Z' } },
    ]);
    expect(r.report.flags).toEqual({ inProgress: true });
    // Od początku miesiąca (pierwsza publikacja w pierwszym tygodniu) do ostatniej publikacji.
    expect(r.report.dataRange).toEqual({
      from: monthStart('2026-10').toISOString(),
      to: '2026-10-11T16:00:00.000Z',
    });
  });

  it('data nie późniejsza niż teraz (gdy zegar urządzenia się spóźnia)', () => {
    const r = success(
      input(parsedOf([...october, row('2026-10-12T15:00:00+02:00', { views: 1 })]), { month: '2026-10' }),
    );
    expect(r.warnings[0]?.params).toEqual({ date: NOW.toISOString() });
    expect(r.report.dataRange.to).toBe(NOW.toISOString());
  });
});

describe('computeReport — zmiana metryki (kwiecień 2025)', () => {
  const now = NOW;
  const apr = row('2025-04-03T12:00:00+02:00', { views: 100 });
  const mar = row('2025-03-10T12:00:00+01:00', { views: 100 });
  // Pierwsza publikacja M−1 w pierwszym tygodniu miesiąca — plik obejmuje M−1 (START_GRACE_DAYS).
  const may = row('2025-05-03T12:00:00+02:00', { views: 100 });
  const jun = row('2025-06-10T12:00:00+02:00', { views: 100 });

  const hasMetricNote = (r: ComputeSuccess) =>
    codes(r).includes('W_METRIC_CHANGE') && r.report.flags.metricChangeNote === true;

  it('M = 2025-04 → przypis (także bez porównania)', () => {
    expect(hasMetricNote(success(input(parsedOf([apr]), { month: '2025-04', now })))).toBe(true);
  });

  it('M = 2025-03 → przypis', () => {
    expect(hasMetricNote(success(input(parsedOf([mar]), { month: '2025-03', now })))).toBe(true);
  });

  it('M = 2025-05 z poprzednim miesiącem 2025-04 → przypis', () => {
    expect(hasMetricNote(success(input(parsedOf([apr, may]), { month: '2025-05', now })))).toBe(true);
    expect(
      hasMetricNote(
        success(input(parsedOf([may]), { month: '2025-05', now, manualPrevious: { actions: { book: 2 } } })),
      ),
    ).toBe(true);
  });

  it('M = 2025-05 bez poprzedniego miesiąca → bez przypisu', () => {
    const r = success(input(parsedOf([may]), { month: '2025-05', now }));
    expect(codes(r)).not.toContain('W_METRIC_CHANGE');
    expect(r.report.flags).not.toHaveProperty('metricChangeNote');
  });

  it('M = 2025-06 z poprzednim 2025-05 → bez przypisu', () => {
    const r = success(input(parsedOf([may, jun]), { month: '2025-06', now }));
    expect(r.report.previous?.source).toBe('file');
    expect(codes(r)).not.toContain('W_METRIC_CHANGE');
  });
});

/* ------------------------------------------------------------------ zakres i błędy */

describe('computeReport — zakres danych', () => {
  it('plik obejmuje sierpień i wrzesień → od początku września do ostatniej publikacji', () => {
    const r = success(input(parsedOf([...august(), ...september()])));
    expect(r.report.dataRange).toEqual({
      from: monthStart('2026-09').toISOString(),
      to: '2026-09-30T19:00:00.000Z',
    });
  });

  it('pierwsza publikacja 5 września (pierwszy tydzień) → od 1 września', () => {
    const rows = [
      row('2026-09-05T08:00:00+02:00', { views: 1 }),
      row('2026-10-03T08:00:00+02:00', { views: 1 }),
    ];
    const r = success(input(parsedOf(rows)));
    expect(r.report.dataRange).toEqual({
      from: monthStart('2026-09').toISOString(),
      to: '2026-09-30T21:59:59.999Z',
    });
  });

  it('plik zaczyna się 13 września → od 13 września (początek dnia), bez udawania pełnego miesiąca', () => {
    const rows = [
      row('2026-09-13T08:00:00+02:00', { views: 1 }),
      row('2026-10-03T08:00:00+02:00', { views: 1 }),
    ];
    const r = success(input(parsedOf(rows)));
    expect(r.report.dataRange).toEqual({
      from: '2026-09-12T22:00:00.000Z',
      to: '2026-09-30T21:59:59.999Z',
    });
  });

  it('późny początek i wczesny koniec: liczba dni w przypisie zgodna z zakresem (13–27 września = 15 dni)', () => {
    const rows = [
      row('2026-09-13T08:00:00+02:00', { views: 1 }),
      row('2026-09-27T20:00:00+02:00', { views: 1 }),
    ];
    const r = success(input(parsedOf(rows)));
    expect(r.warnings).toContainEqual({
      code: 'W_INCOMPLETE_MONTH',
      params: { date: '2026-09-27T18:00:00.000Z', days: 15, monthDays: 30 },
    });
    expect(r.report.flags.incompleteDays).toBe(15);
  });
});

describe('computeReport — pokrycie poprzedniego miesiąca w pliku', () => {
  it('eksport od 13 sierpnia („ostatnie 60 dni”): sierpnia z pliku NIE porównujemy', () => {
    const rows = [
      row('2026-08-13T10:00:00+02:00', { views: 900 }),
      row('2026-08-30T10:00:00+02:00', { views: 900 }),
      ...september(),
    ];
    const r = success(input(parsedOf(rows)));
    expect(r.previousFileCoverage).toBe('partial');
    expect(r.previousFilePartialFrom).toBe('2026-08-13T08:00:00.000Z');
    expect(r.previousFromFile).toBeNull();
    expect(r.report.previous).toBeUndefined();
  });

  it('niepełny sierpień w pliku + liczby ręczne → porównanie z pól ręcznych', () => {
    const rows = [row('2026-08-20T10:00:00+02:00', { views: 900 }), ...september()];
    const r = success(input(parsedOf(rows), { manualPrevious: { views: 11420, actions: { book: 17 } } }));
    expect(r.report.previous?.source).toBe('manual');
    expect(r.report.previous?.summary?.views).toBe(11420);
  });

  it('sierpień od pierwszego tygodnia → pełne pokrycie, porównanie z pliku', () => {
    const r = success(input(parsedOf([...august(), ...september()])));
    expect(r.previousFileCoverage).toBe('full');
    expect(r.previousFilePartialFrom).toBeUndefined();
    expect(r.report.previous?.source).toBe('file');
  });

  it('plik bez sierpnia → brak pokrycia', () => {
    expect(success(input(parsedOf(september()))).previousFileCoverage).toBe('none');
  });
});

describe('computeReport — emoji', () => {
  it('usuwa emoji z tekstów autora i nazw (kroje marki ich nie mają, PDF pokazałby prostokąty)', () => {
    const r = success(
      input(parsedOf(september()), {
        headline: 'Świetny miesiąc 🎉',
        commentWorked: 'Rolki 💅🏽 z metamorfozami zadziałały 👍 najlepiej.',
        commentMark: 'z metamorfozami',
        planNext: '❤️ Więcej rolek',
        client: { name: 'Studio 🌸 Lumi' },
        author: { name: 'Kadr ✨ Social' },
      }),
    );
    expect(r.report.headline).toBe('Świetny miesiąc');
    expect(r.report.commentWorked).toBe('Rolki z metamorfozami zadziałały najlepiej.');
    expect(r.report.commentMark).toBe('z metamorfozami');
    expect(r.report.planNext).toBe('Więcej rolek');
    expect(r.report.client.name).toBe('Studio Lumi');
    expect(r.report.author.name).toBe('Kadr Social');
    expect(stripEmoji('Zażółć gęślą jaźń „cytat” — 12 480')).toBe('Zażółć gęślą jaźń „cytat” — 12 480');
  });
});

describe('computeReport — E_NO_ROWS_IN_MONTH', () => {
  it('brak publikacji z M → błąd z miesiącami i zakresem pliku', () => {
    const parsed = parsedOf([...august(), ...september()]);
    for (const month of ['2026-07', '2026-10']) {
      expect(computeReport(input(parsed, { month }))).toEqual({
        ok: false,
        error: { code: 'E_NO_ROWS_IN_MONTH', months: ['2026-08', '2026-09'], range: parsed.range },
      });
    }
  });
});

/* ------------------------------------------------------------------ teksty i schemat */

describe('computeReport — komentarz i autor', () => {
  const parsed = parsedOf(september());

  it('przycina teksty, pomija puste, zakreślenie tylko jako fragment komentarza', () => {
    const r = success(
      input(parsed, {
        commentWorked: '  Najwięcej rezerwacji przyszło po rolkach z metamorfozami brwi.  ',
        commentMark: ' rolkach z metamorfozami ',
        planNext: '\n',
      }),
    );
    expect(r.report.commentWorked).toBe('Najwięcej rezerwacji przyszło po rolkach z metamorfozami brwi.');
    expect(r.report.commentMark).toBe('rolkach z metamorfozami');
    expect(r.report).not.toHaveProperty('planNext');
  });

  it('zakreślenie spoza komentarza albo bez komentarza jest pomijane', () => {
    const outside = success(input(parsed, { commentWorked: 'Rolki działały.', commentMark: 'relacje' }));
    expect(outside.report).not.toHaveProperty('commentMark');
    const noComment = success(input(parsed, { commentWorked: '  ', commentMark: 'rolki' }));
    expect(noComment.report).not.toHaveProperty('commentWorked');
    expect(noComment.report).not.toHaveProperty('commentMark');
  });

  it('logo autora tylko, gdy podane', () => {
    const withLogo = success(
      input(parsed, {
        branding: 'author',
        author: { name: 'Kadr Social', logoUrl: 'https://example.supabase.co/storage/v1/logo.png' },
      }),
    );
    expect(withLogo.report.author).toEqual({
      name: 'Kadr Social',
      logoUrl: 'https://example.supabase.co/storage/v1/logo.png',
    });
    for (const logoUrl of ['', '   ']) {
      expect(success(input(parsed, { author: { name: 'Kadr Social', logoUrl } })).report.author).toEqual({
        name: 'Kadr Social',
      });
    }
  });
});

describe('computeReport — zgodność z reportDataSchema', () => {
  it('pełny raport (jak przykład) przechodzi walidację', () => {
    const r = success(
      input(parsedOf([...august(), ...september()]), {
        history: { actions: { book: 17, call: 11, directions: 10 } },
        commentWorked: 'Najwięcej rezerwacji przyszło po rolkach z metamorfozami brwi.',
        commentMark: 'rolkach z metamorfozami brwi',
        planNext: 'Cztery kolejne rolki z metamorfozami.',
      }),
    );
    const parsed: ReportData = reportDataSchema.parse(r.report);
    expect(parsed).toEqual(r.report);
    expect(parsed).toMatchObject({
      period: '2026-09',
      client: { name: 'Studio Lumi' },
      branding: 'sedno-footer',
      summary: { posts: 6, views: 7400, follows: 11 },
      actions: { book: 23, call: 9, directions: 14 },
      keyMetric: 'book',
      flags: {},
    });
    expect(parsed.summary.topPosts).toHaveLength(3);
  });

  it('raport minimalny (tylko daty i zasięg, bez efektów) przechodzi walidację', () => {
    const r = success(
      input(parsedOf([row('2026-09-15T12:00:00+02:00', { reach: 10 })], ['publishedAt', 'reach']), {
        actions: { book: null, call: null, directions: null },
        client: { name: '  Bistro Pod Lipą  ' },
        author: { name: '' },
      }),
    );
    expect(r.report.client.name).toBe('Bistro Pod Lipą');
    expect(r.report.summary).toEqual({
      posts: 1,
      byType: { post: 1 },
      views: null,
      interactions: null,
      follows: null,
      topPosts: [],
    });
  });
});

/**
 * Edycja zapisanego raportu bez pliku (lib/report/edits.ts): pola edytora z zapisanego ReportData i ich ponowne
 * nałożenie muszą dawać to samo, co computeReport z tymi samymi danymi (kluczowa liczba, tytuł, M−1, przypisy).
 */
import { describe, expect, it } from 'vitest';
import type { ParsedExport, PostRow, PostType } from '@/lib/csv/types';
import { computeReport, type ComputeInput, type ComputeSuccess } from '@/lib/report/compute';
import {
  applyEdits,
  editsFromReport,
  historyCoverage,
  historyFromReport,
  type ReportEdits,
} from '@/lib/report/edits';
import { reportDataSchema, type ReportData } from '@/lib/report/types';

const TYPES: PostType[] = ['reel', 'post', 'story'];
const FIELDS: ParsedExport['fields'] = [
  'publishedAt',
  'views',
  'likes',
  'comments',
  'shares',
  'saves',
  'follows',
  'type',
];

/** Publikacje co `step` dni od `from` do `to` (włącznie). */
function between(from: string, to: string, step = 2): ParsedExport {
  const rows: PostRow[] = [];
  for (
    let t = Date.parse(`${from}T10:00:00Z`), i = 0;
    t <= Date.parse(`${to}T10:00:00Z`);
    t += step * 864e5, i++
  ) {
    rows.push({
      publishedAt: new Date(t),
      type: TYPES[i % TYPES.length]!,
      views: 400 * (i + 1),
      reach: null,
      likes: 20 + i,
      comments: 2,
      shares: 1,
      saves: 3,
      follows: 1,
    });
  }
  return {
    rows,
    range: { from: rows[0]!.publishedAt, to: rows.at(-1)!.publishedAt },
    months: [...new Set(rows.map((r) => r.publishedAt.toISOString().slice(0, 7)))],
    warnings: [],
    fields: FIELDS,
  };
}

const NOW = new Date('2026-10-13T10:00:00Z');
const SEPTEMBER = between('2026-09-01', '2026-09-30');
const AUG_SEP = between('2026-08-01', '2026-09-30');
/** Plik zaczyna się 13 sierpnia: sierpień z pliku nie wchodzi do porównania (partial). */
const LATE_AUGUST = between('2026-08-13', '2026-09-30');
/** Eksport kończy się 21 września (niepełny miesiąc). */
const SHORT = between('2026-09-01', '2026-09-21');

const HISTORY = {
  summary: { posts: 20, views: 9000, interactions: 400, follows: 30 },
  actions: { book: 17, call: 11, directions: 10 },
};

function input(overrides: Partial<ComputeInput> = {}): ComputeInput {
  return {
    parsed: SEPTEMBER,
    month: '2026-09',
    now: NOW,
    client: { name: 'Studio Lumi' },
    author: { name: 'Kadr Social' },
    branding: 'sedno-footer',
    actions: { book: 23, call: 9, directions: 14 },
    manualPrevious: undefined,
    history: null,
    commentWorked: 'Najwięcej rezerwacji przyszło po rolkach z metamorfozami brwi.',
    commentMark: 'rolkach z metamorfozami',
    planNext: 'Cztery kolejne rolki.',
    ...overrides,
  };
}

function compute(overrides: Partial<ComputeInput> = {}): ComputeSuccess {
  const result = computeReport(input(overrides));
  if (!result.ok) throw new Error('computeReport: brak publikacji');
  return result;
}

/** Pola edytora odpowiadające wejściu computeReport. */
function editsOf(i: ComputeInput): ReportEdits {
  return {
    actions: { ...i.actions },
    previous: {
      actions: {
        book: i.manualPrevious?.actions?.book ?? null,
        call: i.manualPrevious?.actions?.call ?? null,
        directions: i.manualPrevious?.actions?.directions ?? null,
      },
      views: i.manualPrevious?.views ?? null,
    },
    keyMetric: i.keyMetric ?? null,
    headline: i.headline ?? null,
    commentWorked: i.commentWorked ?? '',
    commentMark: i.commentMark ?? null,
    planNext: i.planNext ?? '',
    incompleteNote: i.incompleteNote !== false,
  };
}

const ROUND_TRIPS: Record<string, Partial<ComputeInput>> = {
  'pełny miesiąc bez M−1': {},
  'M−1 z pliku': { parsed: AUG_SEP },
  'M−1 z pliku, efekty M−1 z pól ręcznych': {
    parsed: AUG_SEP,
    manualPrevious: { actions: { book: 3, call: null, directions: 5 } },
  },
  'M−1 z historii': { history: HISTORY },
  'M−1 z pól ręcznych (efekty i wyświetlenia)': {
    manualPrevious: { actions: { book: 12, call: 4, directions: null }, views: 15_000 },
  },
  'M−1 z pliku zaczynającego się w połowie miesiąca (porównanie z pól ręcznych)': {
    parsed: LATE_AUGUST,
    manualPrevious: { views: 3000 },
  },
  'historia ma pierwszeństwo przed polami ręcznymi': {
    history: HISTORY,
    manualPrevious: { actions: { book: 1, call: 1, directions: 1 }, views: 5 },
  },
  'wybrana kluczowa liczba i własny tytuł': { keyMetric: 'call', headline: 'Telefon dzwonił częściej' },
  'kluczowe wyświetlenia (bez kliknięć)': { actions: { book: null, call: 0, directions: null } },
  'niepełny miesiąc z przypisem': { parsed: SHORT },
  'miesiąc w toku': {
    parsed: between('2026-10-01', '2026-10-12'),
    month: '2026-10',
    commentWorked: undefined,
    commentMark: undefined,
  },
  'zmiana metryki (kwiecień 2025)': {
    parsed: between('2025-03-01', '2025-04-30'),
    month: '2025-04',
  },
  'zmiana metryki tylko przez porównanie (maj 2025 z historią)': {
    parsed: between('2025-05-01', '2025-05-31'),
    month: '2025-05',
    history: HISTORY,
  },
  'emoji i białe znaki w tekstach': {
    headline: '  Rekord rezerwacji 🎉 ',
    commentWorked: 'Rolki 🚀 działały.',
    commentMark: 'działały',
    planNext: '  ',
  },
};

describe('applyEdits(editsFromReport(r)) = r', () => {
  for (const [name, overrides] of Object.entries(ROUND_TRIPS)) {
    it(name, () => {
      const i = input(overrides);
      const computed = compute(overrides);
      const edits = editsFromReport(computed.report);
      const again = applyEdits(computed.report, edits, { history: i.history, now: NOW });
      expect(again.report).toEqual(computed.report);
      expect(again.generatedHeadline).toBe(computed.generatedHeadline);
      expect(again.defaultKeyMetric).toBe(computed.defaultKeyMetric);
      expect(again.keyMetricFallback).toBe(computed.keyMetricFallback);
      expect(again.postsSuggestion).toBe(computed.postsSuggestion);
      expect(again.warnings.map((w) => w.code)).toEqual(computed.warnings.map((w) => w.code));
      expect(reportDataSchema.safeParse(again.report).success).toBe(true);
    });
  }
});

describe('zmiany pól dają to samo, co computeReport z tymi zmianami', () => {
  const CHANGES: Record<string, [Partial<ComputeInput>, Partial<ComputeInput>]> = {
    'nowe efekty zmieniają domyślną kluczową liczbę i tytuł': [
      {},
      { actions: { book: 2, call: 40, directions: 1 } },
    ],
    'efekt 0: tytuł „nikt nie kliknął”': [
      {},
      { actions: { book: 0, call: null, directions: null }, keyMetric: 'book' },
    ],
    'wybór kluczowej liczby': [{}, { keyMetric: 'directions' }],
    'wybór pustego efektu ustępuje domyślnemu': [
      {},
      { actions: { book: 5, call: null, directions: 2 }, keyMetric: 'call' },
    ],
    'własny tytuł i powrót do tytułu z liczb': [{ headline: 'Stary tytuł' }, { headline: undefined }],
    'liczby ręczne za M−1': [
      {},
      { manualPrevious: { actions: { book: 9, call: 2, directions: 3 }, views: 8000 } },
    ],
    'usunięcie liczb ręcznych za M−1': [{ manualPrevious: { views: 8000 } }, { manualPrevious: undefined }],
    'nowa historia (raport M−1 zapisany później)': [
      { manualPrevious: { views: 8000 } },
      { manualPrevious: { views: 8000 }, history: HISTORY },
    ],
    'komentarz bez zakreślonego fragmentu usuwa zakreślenie': [{}, { commentWorked: 'Inny komentarz.' }],
    'nowe zakreślenie i plan': [{}, { commentMark: 'Najwięcej rezerwacji', planNext: 'Nowy plan.' }],
    'plik z M−1 zostaje porównaniem, gdy dochodzi historia': [
      { parsed: AUG_SEP },
      { parsed: AUG_SEP, history: HISTORY },
    ],
    'bez przypisu o niepełnym miesiącu': [{ parsed: SHORT }, { parsed: SHORT, incompleteNote: false }],
  };

  for (const [name, [before, after]] of Object.entries(CHANGES)) {
    it(name, () => {
      const base = compute(before).report;
      const expected = compute(after);
      const changed = input(after);
      const result = applyEdits(base, editsOf(changed), { history: changed.history, now: NOW });
      expect(result.report).toEqual(expected.report);
      expect(result.generatedHeadline).toBe(expected.generatedHeadline);
      expect(result.keyMetricFallback).toBe(expected.keyMetricFallback);
    });
  }
});

describe('editsFromReport', () => {
  it('kluczowa liczba równa domyślnej i tytuł z liczb wracają jako domyślne (null)', () => {
    const edits = editsFromReport(compute().report);
    expect(edits.keyMetric).toBeNull();
    expect(edits.headline).toBeNull();
    expect(edits.actions).toEqual({ book: 23, call: 9, directions: 14 });
    expect(edits.commentMark).toBe('rolkach z metamorfozami');
    expect(edits.planNext).toBe('Cztery kolejne rolki.');
    expect(edits.incompleteNote).toBe(true);
  });

  it('wybrana kluczowa liczba i własny tytuł zostają', () => {
    const edits = editsFromReport(compute({ keyMetric: 'call', headline: 'Własny' }).report);
    expect(edits.keyMetric).toBe('call');
    expect(edits.headline).toBe('Własny');
  });

  it('wyświetlenia M−1 są polem ręcznym tylko wtedy, gdy pochodziły z pól ręcznych', () => {
    const manual = editsFromReport(compute({ manualPrevious: { views: 7000, actions: { book: 1 } } }).report);
    expect(manual.previous).toEqual({ actions: { book: 1, call: null, directions: null }, views: 7000 });
    const file = editsFromReport(compute({ parsed: AUG_SEP }).report);
    expect(file.previous.views).toBeNull();
    const history = editsFromReport(compute({ history: HISTORY }).report);
    expect(history.previous.views).toBeNull();
  });

  it('raport bez komentarza i planu daje puste pola', () => {
    const base = compute({ commentWorked: undefined, commentMark: undefined, planNext: undefined }).report;
    const edits = editsFromReport(base);
    expect(edits).toMatchObject({ commentWorked: '', commentMark: null, planNext: '' });
  });
});

describe('applyEdits', () => {
  const base = compute({ parsed: AUG_SEP }).report;
  const edits = editsFromReport(base);

  it('podsumowanie z pliku i zakres dat zostają bez zmian', () => {
    const result = applyEdits(base, { ...edits, actions: { book: 1, call: 2, directions: 3 } }, { now: NOW });
    expect(result.report.summary).toEqual(base.summary);
    expect(result.report.dataRange).toEqual(base.dataRange);
    expect(result.previousFileCoverage).toBe('full');
    expect(result.previousFromFile).toMatchObject({ views: base.previous?.summary?.views });
  });

  it('bez porównania z pliku pokrycie M−1 to „none”', () => {
    const result = applyEdits(compute().report, editsFromReport(compute().report), { now: NOW });
    expect(result.previousFileCoverage).toBe('none');
    expect(result.previousFromFile).toBeNull();
  });

  it('klient, autor i branding z opcji (bez emoji); logo tylko z https z bazy', () => {
    const result = applyEdits(base, edits, {
      now: NOW,
      client: { name: ' Bistro 🍝 Pod Lipą ' },
      author: { name: 'Kadr Social ✨' },
      branding: 'sedno-footer',
    });
    expect(result.report.client.name).toBe('Bistro Pod Lipą');
    expect(result.report.author).toEqual({ name: 'Kadr Social' });
    expect(result.report.branding).toBe('sedno-footer');
  });

  it('czyści liczby jak computeReport: ujemne, NaN i za duże to brak danych, ułamki zaokrągla', () => {
    const result = applyEdits(
      base,
      { ...edits, actions: { book: -1, call: Number.NaN, directions: 2.6 } },
      { now: NOW },
    );
    expect(result.report.actions).toEqual({ book: null, call: null, directions: 3 });
    expect(result.report.keyMetric).toBe('directions');
    const tooBig = applyEdits(
      base,
      { ...edits, actions: { book: 2e9, call: 1, directions: 0 } },
      { now: NOW },
    );
    expect(tooBig.report.actions.book).toBeNull();
  });

  it('ostrzeżenie „miesiąc jeszcze trwa” tylko w trakcie miesiąca; przypis „dane do” zostaje', () => {
    const october = compute({ parsed: between('2026-10-01', '2026-10-12'), month: '2026-10' }).report;
    const during = applyEdits(october, editsFromReport(october), { now: NOW });
    expect(during.warnings.map((w) => w.code)).toContain('W_MONTH_IN_PROGRESS');
    const later = applyEdits(october, editsFromReport(october), { now: new Date('2026-11-20T10:00:00Z') });
    expect(later.warnings.map((w) => w.code)).not.toContain('W_MONTH_IN_PROGRESS');
    expect(later.report.flags.inProgress).toBe(true);
  });

  it('niepełny miesiąc: ostrzeżenie z datą końca eksportu i liczbą dni z zapisu', () => {
    const short = compute({ parsed: SHORT });
    const result = applyEdits(short.report, editsFromReport(short.report), { now: NOW });
    expect(result.warnings).toEqual(short.warnings);
  });

  it('wynik zawsze przechodzi ścisły schemat raportu', () => {
    const result = applyEdits(
      base,
      { ...edits, headline: '   ', commentWorked: '🎉', commentMark: '🎉', planNext: '' },
      { now: NOW },
    );
    expect(result.report.headline).toBe(result.generatedHeadline);
    expect(result.report).not.toHaveProperty('commentWorked');
    expect(result.report).not.toHaveProperty('commentMark');
    expect(result.report).not.toHaveProperty('planNext');
    expect(reportDataSchema.safeParse(result.report).success).toBe(true);
  });
});

describe('historia z zapisanego raportu', () => {
  it('bierze tylko liczby do porównań (bez typów publikacji i najlepszych publikacji)', () => {
    const saved: ReportData = compute().report;
    const history = historyFromReport(saved);
    expect(history).toEqual({
      summary: {
        posts: saved.summary.posts,
        views: saved.summary.views,
        interactions: saved.summary.interactions,
        follows: saved.summary.follows,
      },
      actions: saved.actions,
    });
    expect(history.summary).not.toHaveProperty('byType');
    expect(history.summary).not.toHaveProperty('topPosts');
  });

  it('pokrycie: efekty i podsumowanie osobno, brak danych to brak pokrycia', () => {
    expect(historyCoverage(null)).toEqual({ actions: false, summary: false });
    expect(historyCoverage(HISTORY)).toEqual({ actions: true, summary: true });
    expect(
      historyCoverage({ summary: { views: null }, actions: { book: null, call: 0, directions: null } }),
    ).toEqual({ actions: true, summary: false });
  });

  it('w edytorze z wgranym plikiem historia daje porównanie „{M−1}: {liczba}”', () => {
    const saved = compute({ parsed: between('2026-08-01', '2026-08-31'), month: '2026-08' }).report;
    const result = compute({ history: historyFromReport(saved) });
    expect(result.report.previous).toMatchObject({
      source: 'history',
      actions: { book: 23, call: 9, directions: 14 },
      summary: { views: saved.summary.views },
    });
  });
});

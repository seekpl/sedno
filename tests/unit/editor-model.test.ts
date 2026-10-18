/**
 * Edytor raportu z kontem — czyste funkcje (components/editor/model.ts) i stan reduktora w trybie konta
 * (components/tool/state.ts: initialEditorState, OPEN_UPLOAD, DISCARD_FILE, SAVED, krok „Wyślij”).
 */
import { describe, expect, it } from 'vitest';
import { clientsHref, initialStep, validEditorParams } from '@/components/editor/model';
import {
  editsFromState,
  effectsFor,
  initialEditorState,
  initialToolState,
  manualViewsFor,
  toolReducer,
  type ToolAction,
  type ToolState,
} from '@/components/tool/state';
import type { ParsedExport } from '@/lib/csv/types';
import { editsFromReport } from '@/lib/report/edits';
import { EXAMPLE_REPORT } from '@/lib/report/example';
import type { ReportData } from '@/lib/report/types';

const ID = '0b9f8a3c-5d1e-4f2a-9c7b-1a2b3c4d5e6f';

const PARSED: ParsedExport = {
  rows: [
    {
      publishedAt: new Date('2026-09-03T10:00:00Z'),
      type: 'reel',
      views: 1200,
      reach: null,
      likes: 40,
      comments: 3,
      shares: 1,
      saves: 2,
      follows: null,
    },
  ],
  range: { from: new Date('2026-09-03T10:00:00Z'), to: new Date('2026-09-03T10:00:00Z') },
  months: ['2026-09'],
  warnings: [],
  fields: ['publishedAt', 'views', 'likes', 'comments', 'shares', 'saves', 'type'],
};

function run(actions: ToolAction[], from: ToolState): ToolState {
  return actions.reduce(toolReducer, from);
}

/** Zapis z liczbami ręcznymi za M−1 i własnym tytułem. */
const SAVED: ReportData = {
  ...EXAMPLE_REPORT,
  previous: { source: 'manual', summary: { views: 9000 }, actions: { book: 17, call: 11, directions: 10 } },
  headline: 'Rekordowy wrzesień',
};

describe('validEditorParams', () => {
  it('uuid i miesiąc od 2000-01 do bieżącego', () => {
    expect(validEditorParams(ID, '2026-09', '2026-10')).toBe(true);
    expect(validEditorParams(ID, '2026-10', '2026-10')).toBe(true);
    expect(validEditorParams(ID.toUpperCase(), '2000-01', '2026-10')).toBe(true);
  });

  it.each([
    ['miesiąc z przyszłości', ID, '2026-11'],
    ['przed 2000 r.', ID, '1999-12'],
    ['miesiąc 13', ID, '2026-13'],
    ['zły format miesiąca', ID, '2026-9'],
    ['nie uuid', 'klient', '2026-09'],
    ['uuid z dopiskiem', `${ID}x`, '2026-09'],
  ])('odrzuca: %s', (_name, id, month) => {
    expect(validEditorParams(id, month, '2026-10')).toBe(false);
  });
});

describe('initialStep (?krok=)', () => {
  it('bez zapisu zawsze krok 1', () => {
    for (const krok of [undefined, '1', '2', '3', ['3']]) expect(initialStep(krok, false)).toBe('upload');
  });

  it('z zapisem: domyślnie krok 2, 1 i 3 na życzenie, reszta jak domyślnie', () => {
    expect(initialStep(undefined, true)).toBe('effects');
    expect(initialStep('1', true)).toBe('upload');
    expect(initialStep('2', true)).toBe('effects');
    expect(initialStep('3', true)).toBe('send');
    expect(initialStep('9', true)).toBe('effects');
    expect(initialStep(['3', '1'], true)).toBe('effects');
  });

  it('link do listy klientów za miesiąc raportu', () => {
    expect(clientsHref('2026-09')).toBe('/app/klienci?m=2026-09');
  });
});

describe('initialEditorState', () => {
  it('bez zapisu: krok 1 i puste pola (jak /nowy)', () => {
    expect(initialEditorState({ month: '2026-09', base: null })).toEqual(initialToolState('2026-09'));
  });

  it('z zapisu: krok 2, efekty M, liczby ręczne M−1, własny tytuł, komentarz i zakreślenie', () => {
    const state = initialEditorState({ month: '2026-09', base: SAVED });
    expect(state.step).toBe('effects');
    expect(state.base).toBe(SAVED);
    expect(state.parsed).toBeNull();
    expect(effectsFor(state.effects, '2026-09')).toEqual(SAVED.actions);
    expect(effectsFor(state.effects, '2026-08')).toEqual({ book: 17, call: 11, directions: 10 });
    expect(manualViewsFor(state.manualViews, '2026-08')).toBe(9000);
    expect(state.keyMetric).toBeNull();
    expect(state.headline).toBe('Rekordowy wrzesień');
    expect(state.commentWorked).toBe(SAVED.commentWorked);
    expect(state.commentMark).toBe(SAVED.commentMark);
    expect(state.planNext).toBe(SAVED.planNext);
  });

  it('pola ze stanu to te same pola, co z zapisu', () => {
    const state = initialEditorState({ month: '2026-09', base: SAVED, step: 'send' });
    expect(state.step).toBe('send');
    expect(editsFromState(state)).toEqual(editsFromReport(SAVED));
  });
});

describe('reduktor w trybie konta', () => {
  const saved = () => initialEditorState({ month: '2026-09', base: SAVED });

  it('krok 2 ↔ 3 bez pliku, gdy jest zapis', () => {
    const send = run([{ type: 'GO_TO', step: 'send' }], saved());
    expect(send.step).toBe('send');
    expect(run([{ type: 'GO_TO', step: 'effects' }], send).step).toBe('effects');
    // Bez zapisu i bez pliku nie ma dokąd iść.
    const empty = initialEditorState({ month: '2026-09', base: null });
    expect(run([{ type: 'GO_TO', step: 'send' }], empty)).toBe(empty);
  });

  it('„Wgraj eksport ponownie” → krok 1 bez błędu; w trakcie czytania pliku nic nie zmienia', () => {
    const upload = run([{ type: 'OPEN_UPLOAD' }], saved());
    expect(upload.step).toBe('upload');
    expect(upload.base).toBe(SAVED);
    const parsing = run([{ type: 'FILE_SELECTED', file: { name: 'a.csv', size: 1 } }], upload);
    expect(run([{ type: 'OPEN_UPLOAD' }], parsing)).toBe(parsing);
  });

  it('powrót do zapisu porzuca plik i jego błędy, zostawia wpisane pola', () => {
    const withFile = run(
      [
        { type: 'OPEN_UPLOAD' },
        { type: 'FILE_SELECTED', file: { name: 'a.csv', size: 1 } },
        { type: 'PARSE_SUCCESS', data: PARSED },
        { type: 'SET_ACTION', key: 'book', value: 40 },
      ],
      saved(),
    );
    expect(withFile.parsed).toBe(PARSED);
    const back = run([{ type: 'DISCARD_FILE' }], withFile);
    expect(back).toMatchObject({ step: 'effects', parsed: null, file: null, parse: { status: 'idle' } });
    expect(effectsFor(back.effects, '2026-09').book).toBe(40);
    // Bez zapisu nie ma do czego wracać.
    const fresh = initialEditorState({ month: '2026-09', base: null });
    expect(run([{ type: 'DISCARD_FILE' }], fresh)).toBe(fresh);
  });

  it('zapis staje się punktem wyjścia; plik zostaje w pamięci', () => {
    const withFile = run(
      [
        { type: 'FILE_SELECTED', file: { name: 'a.csv', size: 1 } },
        { type: 'PARSE_SUCCESS', data: PARSED },
      ],
      initialEditorState({ month: '2026-09', base: null }),
    );
    const next: ReportData = { ...SAVED, headline: 'Po zapisie' };
    const after = run([{ type: 'SAVED', data: next }], withFile);
    expect(after.base).toBe(next);
    expect(after.parsed).toBe(PARSED);
    expect(run([{ type: 'GO_TO', step: 'send' }], after).step).toBe('send');
  });
});

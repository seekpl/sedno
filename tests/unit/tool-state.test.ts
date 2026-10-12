/**
 * Stan narzędzia /nowy (components/tool/state.ts): przejścia kroków, zmiana miesiąca bez ponownego parsowania,
 * mapowanie kolumn z ponowną próbą, zerowanie przy nowym pliku, zakreślenie i tytuł.
 */
import { describe, expect, it } from 'vitest';
import {
  effectsFor,
  initialToolState,
  manualViewsFor,
  MARK_MAX,
  toolReducer,
  type ToolAction,
  type ToolState,
} from '@/components/tool/state';
import type { ParsedExport } from '@/lib/csv/types';

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

const FILE = { name: 'eksport.csv', size: 2048 };

function run(actions: ToolAction[], from: ToolState = initialToolState('2026-09')): ToolState {
  return actions.reduce(toolReducer, from);
}

/** Stan po udanym wczytaniu pliku (krok 2). */
function loaded(): ToolState {
  return run([
    { type: 'FILE_SELECTED', file: FILE },
    { type: 'PARSE_SUCCESS', data: PARSED },
  ]);
}

describe('stan początkowy', () => {
  it('zaczyna od kroku 1 z wybranym miesiącem i pustymi polami', () => {
    const state = initialToolState('2026-09');
    expect(state.step).toBe('upload');
    expect(state.month).toBe('2026-09');
    expect(state.parse).toEqual({ status: 'idle' });
    expect(effectsFor(state.effects, '2026-09')).toEqual({ book: null, call: null, directions: null });
    expect(manualViewsFor(state.manualViews, '2026-08')).toBeNull();
    expect(state.keyMetric).toBeNull();
    expect(state.headline).toBeNull();
    expect(state.commentMark).toBeNull();
    expect(state.incompleteNote).toBe(true);
    expect(state.pdf).toEqual({ status: 'idle' });
  });
});

describe('przejścia kroków', () => {
  it('wybór pliku → parsowanie z postępem → krok 2', () => {
    let state = run([{ type: 'FILE_SELECTED', file: FILE }]);
    expect(state.step).toBe('upload');
    expect(state.file).toEqual(FILE);
    expect(state.parse).toEqual({ status: 'parsing', done: 0, total: 0 });

    state = toolReducer(state, { type: 'PARSE_PROGRESS', done: 500, total: 1200 });
    expect(state.parse).toEqual({ status: 'parsing', done: 500, total: 1200 });

    state = toolReducer(state, { type: 'PARSE_SUCCESS', data: PARSED });
    expect(state.step).toBe('effects');
    expect(state.parsed).toBe(PARSED);
    expect(state.parse).toEqual({ status: 'done' });
    expect(state.loadId).toBe(1);
  });

  it('postęp po zakończeniu parsowania niczego nie zmienia', () => {
    const state = loaded();
    expect(toolReducer(state, { type: 'PARSE_PROGRESS', done: 1, total: 2 })).toBe(state);
  });

  it('błąd pliku zostaje w kroku 1, bez danych i bez ekranu mapowania', () => {
    const state = run([
      { type: 'FILE_SELECTED', file: FILE },
      { type: 'PARSE_ERROR', error: { code: 'E_TOO_BIG', reason: 'size' } },
    ]);
    expect(state.step).toBe('upload');
    expect(state.parse).toEqual({ status: 'error', error: { code: 'E_TOO_BIG', reason: 'size' } });
    expect(state.parsed).toBeNull();
    expect(state.mapping).toBeNull();
    expect(run([{ type: 'OPEN_MAPPING' }], state)).toBe(state);
  });

  it('krok 2 → 3 → 2; bez wczytanego pliku nie da się przejść dalej', () => {
    expect(run([{ type: 'GO_TO', step: 'preview' }]).step).toBe('upload');
    let state = toolReducer(loaded(), { type: 'GO_TO', step: 'preview' });
    expect(state.step).toBe('preview');
    state = toolReducer(state, { type: 'GO_TO', step: 'effects' });
    expect(state.step).toBe('effects');
  });

  it('PDF bez nazwy klienta prowadzi do kroku 2 i oznacza pole', () => {
    const state = run([{ type: 'GO_TO', step: 'preview' }, { type: 'REQUEST_CLIENT_NAME' }], loaded());
    expect(state.step).toBe('effects');
    expect(state.clientNameRequested).toBe(true);
  });

  it('status PDF: start → sukces z nazwą klienta; ponowny start w trakcie jest ignorowany', () => {
    let state = run([{ type: 'GO_TO', step: 'preview' }, { type: 'PDF_START' }], loaded());
    expect(state.pdf).toEqual({ status: 'busy' });
    expect(toolReducer(state, { type: 'PDF_START' })).toBe(state);
    state = toolReducer(state, { type: 'PDF_SUCCESS', client: 'Studio Lumi' });
    expect(state.pdf).toEqual({ status: 'done', client: 'Studio Lumi' });
    // Powrót do edycji chowa komunikat o gotowym PDF (treść mogła się zmienić).
    expect(toolReducer(state, { type: 'GO_TO', step: 'effects' }).pdf).toEqual({ status: 'idle' });
    expect(run([{ type: 'PDF_START' }, { type: 'PDF_ERROR' }], loaded()).pdf).toEqual({ status: 'error' });
  });

  it('wynik PDF po powrocie do edycji albo zmianie miesiąca w trakcie nie pokazuje komunikatu', () => {
    const busy = run([{ type: 'GO_TO', step: 'preview' }, { type: 'PDF_START' }], loaded());
    const back = run(
      [
        { type: 'GO_TO', step: 'effects' },
        { type: 'PDF_SUCCESS', client: 'Studio Lumi' },
      ],
      busy,
    );
    expect(back.pdf).toEqual({ status: 'idle' });
    const moved = run([{ type: 'SET_MONTH', month: '2026-08' }, { type: 'PDF_ERROR' }], busy);
    expect(moved.pdf).toEqual({ status: 'idle' });
  });
});

describe('miesiąc', () => {
  it('zmiana miesiąca zostawia wczytane wiersze (bez ponownego parsowania) i krok', () => {
    const before = run([{ type: 'GO_TO', step: 'preview' }], loaded());
    const after = toolReducer(before, { type: 'SET_MONTH', month: '2026-08' });
    expect(after.month).toBe('2026-08');
    expect(after.parsed).toBe(before.parsed);
    expect(after.step).toBe('preview');
    expect(after.loadId).toBe(before.loadId);
  });

  it('ten sam miesiąc nie zmienia stanu', () => {
    const state = loaded();
    expect(toolReducer(state, { type: 'SET_MONTH', month: '2026-09' })).toBe(state);
  });

  it('nowy miesiąc rozwija ponownie ostrzeżenie o niepełnym miesiącu', () => {
    const state = run([{ type: 'KEEP_NOTE' }, { type: 'SET_MONTH', month: '2026-08' }], loaded());
    expect(state.incompleteCollapsed).toBe(false);
    expect(state.incompleteNote).toBe(true);
  });
});

describe('mapowanie kolumn', () => {
  const missing: ToolAction = {
    type: 'PARSE_ERROR',
    error: { code: 'E_MISSING_COLUMNS', missing: ['views'], headers: ['Data', 'Odsłony', 'Opis'] },
  };

  it('E_MISSING_COLUMNS → ekran „Przypisz kolumny” → ponowna próba → krok 2', () => {
    let state = run([{ type: 'FILE_SELECTED', file: FILE }, missing]);
    expect(state.step).toBe('upload');
    expect(state.mapping).toEqual({ headers: ['Data', 'Odsłony', 'Opis'], missing: ['views'], failed: null });

    state = toolReducer(state, { type: 'OPEN_MAPPING' });
    expect(state.step).toBe('mapping');

    state = toolReducer(state, { type: 'MAPPING_SUBMITTED' });
    expect(state.step).toBe('mapping');
    expect(state.parse.status).toBe('parsing');

    state = toolReducer(state, { type: 'PARSE_SUCCESS', data: PARSED });
    expect(state.step).toBe('effects');
    expect(state.mapping).toBeNull();
  });

  it('kolumna bez wartości pola zostaje na ekranie mapowania z błędem przy polu', () => {
    let state = run([{ type: 'FILE_SELECTED', file: FILE }, missing, { type: 'OPEN_MAPPING' }]);
    state = run(
      [{ type: 'MAPPING_SUBMITTED' }, { type: 'MAPPING_FAILED', field: 'publishedAt', header: 'Opis' }],
      state,
    );
    expect(state.step).toBe('mapping');
    expect(state.parse).toEqual({ status: 'idle' });
    expect(state.mapping?.failed).toEqual({ field: 'publishedAt', header: 'Opis' });
    // Kolejna próba czyści poprzedni błąd.
    expect(toolReducer(state, { type: 'MAPPING_SUBMITTED' }).mapping?.failed).toBeNull();
  });
});

describe('nowy plik', () => {
  it('zeruje dane pliku i status PDF, a zostawia to, co wpisał SMM-owiec', () => {
    const edited = run(
      [
        { type: 'SET_CLIENT', name: 'Studio Lumi' },
        { type: 'SET_AUTHOR', name: 'Kadr Social' },
        { type: 'SET_ACTION', key: 'book', value: 23 },
        { type: 'SET_PREVIOUS_ACTION', key: 'book', value: 17 },
        { type: 'SET_KEY_METRIC', key: 'book' },
        { type: 'SET_HEADLINE', value: 'Mój tytuł' },
        { type: 'SET_COMMENT_WORKED', value: 'Najwięcej rezerwacji po rolkach.' },
        { type: 'SET_MARK', text: 'po rolkach' },
        { type: 'KEEP_NOTE' },
        { type: 'GO_TO', step: 'preview' },
        { type: 'PDF_START' },
        { type: 'PDF_SUCCESS', client: 'Studio Lumi' },
      ],
      loaded(),
    );
    const next = toolReducer(edited, { type: 'FILE_SELECTED', file: { name: 'pelny.csv', size: 4096 } });
    expect(next.step).toBe('upload');
    expect(next.file).toEqual({ name: 'pelny.csv', size: 4096 });
    expect(next.parsed).toBeNull();
    expect(next.mapping).toBeNull();
    expect(next.parse).toEqual({ status: 'parsing', done: 0, total: 0 });
    expect(next.pdf).toEqual({ status: 'idle' });
    expect(next.incompleteCollapsed).toBe(false);
    expect(next.clientName).toBe('Studio Lumi');
    expect(next.authorName).toBe('Kadr Social');
    expect(effectsFor(next.effects, '2026-09').book).toBe(23);
    expect(effectsFor(next.effects, '2026-08').book).toBe(17);
    expect(next.keyMetric).toBe('book');
    expect(next.headline).toBe('Mój tytuł');
    expect(next.commentMark).toBe('po rolkach');

    const reloaded = toolReducer(next, { type: 'PARSE_SUCCESS', data: PARSED });
    expect(reloaded.loadId).toBe(edited.loadId + 1);
  });
});

describe('zakreślenie', () => {
  const withComment = () =>
    run([{ type: 'SET_COMMENT_WORKED', value: 'Najwięcej rezerwacji przyszło po rolkach z metamorfozami.' }]);

  it('ustawia przycięty fragment komentarza; nowy zastępuje poprzedni (jedno na raport)', () => {
    let state = toolReducer(withComment(), { type: 'SET_MARK', text: '  rolkach z metamorfozami ' });
    expect(state.commentMark).toBe('rolkach z metamorfozami');
    state = toolReducer(state, { type: 'SET_MARK', text: 'Najwięcej rezerwacji' });
    expect(state.commentMark).toBe('Najwięcej rezerwacji');
  });

  it('odrzuca pusty fragment, tekst spoza komentarza i fragment dłuższy niż limit', () => {
    const state = withComment();
    expect(toolReducer(state, { type: 'SET_MARK', text: '   ' })).toBe(state);
    expect(toolReducer(state, { type: 'SET_MARK', text: 'czego nie ma' })).toBe(state);
    const long = run([{ type: 'SET_COMMENT_WORKED', value: 'a'.repeat(MARK_MAX + 10) }]);
    expect(toolReducer(long, { type: 'SET_MARK', text: 'a'.repeat(MARK_MAX + 1) })).toBe(long);
    expect(toolReducer(long, { type: 'SET_MARK', text: 'a'.repeat(MARK_MAX) }).commentMark).toHaveLength(
      MARK_MAX,
    );
  });

  it('znika po usunięciu albo gdy fragmentu nie ma już w komentarzu', () => {
    const marked = toolReducer(withComment(), { type: 'SET_MARK', text: 'po rolkach' });
    expect(toolReducer(marked, { type: 'CLEAR_MARK' }).commentMark).toBeNull();
    const kept = toolReducer(marked, { type: 'SET_COMMENT_WORKED', value: 'Wszystko po rolkach.' });
    expect(kept.commentMark).toBe('po rolkach');
    const gone = toolReducer(marked, { type: 'SET_COMMENT_WORKED', value: 'Po relacjach.' });
    expect(gone.commentMark).toBeNull();
  });
});

describe('tytuł raportu', () => {
  it('wpisany tytuł nadpisuje szablon, „Przywróć tytuł z liczb” wraca do szablonu', () => {
    let state = toolReducer(loaded(), { type: 'SET_HEADLINE', value: 'Rekordowy wrzesień' });
    expect(state.headline).toBe('Rekordowy wrzesień');
    state = toolReducer(state, { type: 'RESTORE_HEADLINE' });
    expect(state.headline).toBeNull();
  });
});

describe('efekty i przypis', () => {
  it('liczby efektów, M−1 i kluczowa liczba', () => {
    const state = run([
      { type: 'SET_ACTION', key: 'call', value: 9 },
      { type: 'SET_ACTION', key: 'call', value: null },
      { type: 'SET_ACTION', key: 'directions', value: 14 },
      { type: 'SET_PREVIOUS_ACTION', key: 'directions', value: 10 },
      { type: 'SET_PREVIOUS_VIEWS', value: 11_420 },
      { type: 'SET_KEY_METRIC', key: 'views' },
    ]);
    expect(effectsFor(state.effects, '2026-09')).toEqual({ book: null, call: null, directions: 14 });
    expect(effectsFor(state.effects, '2026-08')).toEqual({ book: null, call: null, directions: 10 });
    expect(manualViewsFor(state.manualViews, '2026-08')).toBe(11_420);
    expect(state.keyMetric).toBe('views');
  });

  it('liczby wpisane ręcznie zostają przy swoich miesiącach po zmianie miesiąca', () => {
    // Wrzesień: efekty 23 i liczby z sierpnia (M−1) 17 oraz 11 420 wyświetleń.
    let state = run([
      { type: 'SET_ACTION', key: 'book', value: 23 },
      { type: 'SET_PREVIOUS_ACTION', key: 'book', value: 17 },
      { type: 'SET_PREVIOUS_VIEWS', value: 11_420 },
    ]);
    // Sierpień: liczby wpisane za sierpień są teraz efektami sierpnia, a pola lipca (M−1) są puste —
    // 17 nie może trafić do raportu jako „lipiec: 17”.
    state = toolReducer(state, { type: 'SET_MONTH', month: '2026-08' });
    expect(effectsFor(state.effects, '2026-08').book).toBe(17);
    expect(effectsFor(state.effects, '2026-07')).toEqual({ book: null, call: null, directions: null });
    expect(manualViewsFor(state.manualViews, '2026-07')).toBeNull();
    // Październik: wrzesień (23) jest porównaniem M−1, październik zaczyna od pustych pól.
    state = toolReducer(state, { type: 'SET_MONTH', month: '2026-10' });
    expect(effectsFor(state.effects, '2026-10')).toEqual({ book: null, call: null, directions: null });
    expect(effectsFor(state.effects, '2026-09').book).toBe(23);
    // Powrót na wrzesień: nic nie zginęło.
    state = toolReducer(state, { type: 'SET_MONTH', month: '2026-09' });
    expect(effectsFor(state.effects, '2026-09').book).toBe(23);
    expect(effectsFor(state.effects, '2026-08').book).toBe(17);
    expect(manualViewsFor(state.manualViews, '2026-08')).toBe(11_420);
  });

  it('„Zostaw przypis” zostawia przypis w raporcie i zwija ostrzeżenie', () => {
    const state = toolReducer(loaded(), { type: 'KEEP_NOTE' });
    expect(state.incompleteNote).toBe(true);
    expect(state.incompleteCollapsed).toBe(true);
  });
});

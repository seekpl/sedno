/**
 * Stan narzędzia /nowy (1. Wgraj → 2. Efekty → 3. Podgląd i PDF) i edytora raportu z kontem
 * (1. Eksport → 2. Efekty i komentarz → 3. Wyślij) jako czysty reduktor — do useReducer i testów.
 * Wiersze z pliku (ParsedExport) żyją wyłącznie tutaj, w pamięci karty: nigdy w localStorage, sessionStorage
 * ani w adresie strony (zasada 1). Wszystko, co wpisuje SMM-owiec, przeżywa wgranie nowego pliku.
 * W edytorze z kontem punktem wyjścia bywa zapisany raport (`base`) — bez wierszy, tylko z liczbami.
 */
import type { ParseError, ParsedExport, RequiredField } from '@/lib/csv/types';
import { addMonths, type MonthKey } from '@/lib/i18n/pl';
import { editsFromReport, type ReportEdits } from '@/lib/report/edits';
import type { ActionKey, Actions, KeyMetric, ReportData } from '@/lib/report/types';

/** 'preview' — krok 3 w /nowy (podgląd i PDF), 'send' — krok 3 edytora z kontem (link, PDF, wysłanie). */
export type Step = 'upload' | 'mapping' | 'effects' | 'preview' | 'send';

/** Błąd wczytywania: błąd formatu z parsera albo nieoczekiwany błąd przeglądarki przy czytaniu pliku. */
export type UploadError = ParseError | { code: 'E_READ' };

export type ParseStatus =
  | { status: 'idle' }
  | { status: 'parsing'; done: number; total: number }
  | { status: 'error'; error: UploadError }
  | { status: 'done' };

/** Ekran „Przypisz kolumny”: nagłówki z pliku i pole, którego parser nie znalazł w wybranej kolumnie. */
export type MappingState = {
  headers: string[];
  missing: RequiredField[];
  failed: { field: RequiredField; header: string } | null;
};

export type PdfStatus =
  { status: 'idle' } | { status: 'busy' } | { status: 'done'; client: string } | { status: 'error' };

export type ToolState = {
  step: Step;
  month: MonthKey;
  /** Nazwa i rozmiar wybranego pliku (do chipa). Sam plik trzyma komponent w pamięci. */
  file: { name: string; size: number } | null;
  /** Numer udanego wczytania — rośnie z każdym plikiem (zdarzenie report_previewed raz na plik). */
  loadId: number;
  parse: ParseStatus;
  parsed: ParsedExport | null;
  /**
   * Zapisany raport (edytor z kontem): punkt wyjścia, gdy w tej karcie nie wczytano pliku. Zapis nie ma
   * wierszy, więc liczby z podsumowania zostają z zapisu, a pola edytora nakłada na nie lib/report/edits.ts.
   */
  base: ReportData | null;
  mapping: MappingState | null;
  authorName: string;
  clientName: string;
  /** Użytkownik próbował pobrać PDF bez nazwy klienta — pole pokazuje błąd, dopóki jest puste. */
  clientNameRequested: boolean;
  /**
   * Efekty wpisane ręcznie, osobno dla każdego miesiąca kalendarzowego ('YYYY-MM' → liczby). Pola bieżącego
   * miesiąca i nieobowiązkowe pola M−1 to wpisy dwóch miesięcy, więc po zmianie miesiąca liczby nie
   * przechodzą na inny miesiąc (np. „lipiec: 17” z liczby wpisanej za sierpień), a liczby za sierpień
   * wpisane jako M−1 stają się efektami sierpnia po przełączeniu na sierpień.
   */
  effects: Partial<Record<MonthKey, Actions>>;
  /** Wyświetlenia wpisane ręcznie za miesiąc, którego plik nie obejmuje (pole M−1). */
  manualViews: Partial<Record<MonthKey, number | null>>;
  /** null = domyślna kluczowa liczba z computeReport. */
  keyMetric: KeyMetric | null;
  /** null = tytuł z szablonu; tekst = tytuł wpisany przez użytkownika. */
  headline: string | null;
  commentWorked: string;
  planNext: string;
  /** Jeden fragment „Co zadziałało” w zakreślaczu albo null. */
  commentMark: string | null;
  /** Przypis o niepełnym miesiącu w raporcie (domyślnie tak) i czy ostrzeżenie jest zwinięte. */
  incompleteNote: boolean;
  incompleteCollapsed: boolean;
  pdf: PdfStatus;
};

const EMPTY_ACTIONS: Actions = Object.freeze({ book: null, call: null, directions: null });

/** Efekty wpisane za miesiąc (wszystkie puste, gdy nic nie wpisano). */
export function effectsFor(effects: ToolState['effects'], month: MonthKey): Actions {
  return effects[month] ?? EMPTY_ACTIONS;
}

/** Wyświetlenia wpisane ręcznie za miesiąc albo null. */
export function manualViewsFor(views: ToolState['manualViews'], month: MonthKey): number | null {
  return views[month] ?? null;
}

function withEffect(state: ToolState, month: MonthKey, key: ActionKey, value: number | null): ToolState {
  const effects = { ...state.effects, [month]: { ...effectsFor(state.effects, month), [key]: value } };
  return { ...state, effects };
}

/** Najdłuższy fragment w zakreślaczu (reportDataSchema: commentMark ≤ 300 znaków). */
export const MARK_MAX = 300;

export function initialToolState(month: MonthKey): ToolState {
  return {
    step: 'upload',
    month,
    file: null,
    loadId: 0,
    parse: { status: 'idle' },
    parsed: null,
    base: null,
    mapping: null,
    authorName: '',
    clientName: '',
    clientNameRequested: false,
    effects: {},
    manualViews: {},
    keyMetric: null,
    headline: null,
    commentWorked: '',
    planNext: '',
    commentMark: null,
    incompleteNote: true,
    incompleteCollapsed: false,
    pdf: { status: 'idle' },
  };
}

/**
 * Stan edytora z kontem. Z zapisanym raportem: pola edytora z zapisu (lib/report/edits.ts) i krok 2
 * (albo wskazany), bez zapisu — krok 1. Efekty M i liczby ręczne M−1 trafiają do swoich miesięcy jak w /nowy.
 */
export function initialEditorState({
  month,
  base,
  step,
}: {
  month: MonthKey;
  base: ReportData | null;
  step?: 'upload' | 'effects' | 'send';
}): ToolState {
  const state = initialToolState(month);
  if (!base) return state;
  const edits = editsFromReport(base);
  const previousMonth = addMonths(month, -1);
  return {
    ...state,
    step: step ?? 'effects',
    base,
    effects: { [month]: edits.actions, [previousMonth]: edits.previous.actions },
    manualViews: { [previousMonth]: edits.previous.views },
    keyMetric: edits.keyMetric,
    headline: edits.headline,
    commentWorked: edits.commentWorked,
    commentMark: edits.commentMark,
    planNext: edits.planNext,
    incompleteNote: edits.incompleteNote,
  };
}

/** Pola edytora ze stanu (do lib/report/edits.ts: applyEdits). */
export function editsFromState(state: ToolState): ReportEdits {
  const previousMonth = addMonths(state.month, -1);
  return {
    actions: effectsFor(state.effects, state.month),
    previous: {
      actions: effectsFor(state.effects, previousMonth),
      views: manualViewsFor(state.manualViews, previousMonth),
    },
    keyMetric: state.keyMetric,
    headline: state.headline,
    commentWorked: state.commentWorked,
    commentMark: state.commentMark,
    planNext: state.planNext,
    incompleteNote: state.incompleteNote,
  };
}

export type ToolAction =
  | { type: 'FILE_SELECTED'; file: { name: string; size: number } }
  | { type: 'PARSE_PROGRESS'; done: number; total: number }
  | { type: 'PARSE_SUCCESS'; data: ParsedExport }
  | { type: 'PARSE_ERROR'; error: UploadError }
  | { type: 'OPEN_MAPPING' }
  | { type: 'MAPPING_SUBMITTED' }
  | { type: 'MAPPING_FAILED'; field: RequiredField; header: string }
  | { type: 'SET_MONTH'; month: MonthKey }
  | { type: 'SET_AUTHOR'; name: string }
  | { type: 'SET_CLIENT'; name: string }
  | { type: 'SET_ACTION'; key: ActionKey; value: number | null }
  | { type: 'SET_PREVIOUS_ACTION'; key: ActionKey; value: number | null }
  | { type: 'SET_PREVIOUS_VIEWS'; value: number | null }
  | { type: 'SET_KEY_METRIC'; key: KeyMetric }
  | { type: 'SET_HEADLINE'; value: string }
  | { type: 'RESTORE_HEADLINE' }
  | { type: 'SET_COMMENT_WORKED'; value: string }
  | { type: 'SET_PLAN'; value: string }
  | { type: 'SET_MARK'; text: string }
  | { type: 'CLEAR_MARK' }
  | { type: 'KEEP_NOTE' }
  | { type: 'GO_TO'; step: 'effects' | 'preview' | 'send' }
  /** Edytor z kontem: krok 1 bez wybierania pliku (np. „Wgraj eksport ponownie”). */
  | { type: 'OPEN_UPLOAD' }
  /** Edytor z kontem: powrót do zapisanego raportu bez wczytanego pliku. */
  | { type: 'DISCARD_FILE' }
  /** Edytor z kontem: raport zapisany — staje się punktem wyjścia (np. po zamknięciu pliku). */
  | { type: 'SAVED'; data: ReportData }
  | { type: 'REQUEST_CLIENT_NAME' }
  | { type: 'PDF_START' }
  | { type: 'PDF_SUCCESS'; client: string }
  | { type: 'PDF_ERROR' };

export function toolReducer(state: ToolState, action: ToolAction): ToolState {
  switch (action.type) {
    case 'FILE_SELECTED':
      // Nowy plik zeruje wszystko, co pochodzi z poprzedniego pliku; wpisane liczby i teksty zostają.
      return {
        ...state,
        step: 'upload',
        file: action.file,
        parse: { status: 'parsing', done: 0, total: 0 },
        parsed: null,
        mapping: null,
        incompleteCollapsed: false,
        pdf: { status: 'idle' },
      };

    case 'PARSE_PROGRESS':
      if (state.parse.status !== 'parsing') return state;
      return { ...state, parse: { status: 'parsing', done: action.done, total: action.total } };

    case 'PARSE_SUCCESS':
      return {
        ...state,
        step: 'effects',
        loadId: state.loadId + 1,
        parse: { status: 'done' },
        parsed: action.data,
        mapping: null,
        incompleteCollapsed: false,
        pdf: { status: 'idle' },
      };

    case 'PARSE_ERROR': {
      const error = action.error;
      return {
        ...state,
        step: 'upload',
        parse: { status: 'error', error },
        parsed: null,
        mapping:
          error.code === 'E_MISSING_COLUMNS'
            ? { headers: [...error.headers], missing: [...error.missing], failed: null }
            : null,
      };
    }

    case 'OPEN_MAPPING':
      if (!state.mapping) return state;
      return { ...state, step: 'mapping', parse: { status: 'idle' } };

    case 'MAPPING_SUBMITTED':
      if (!state.mapping) return state;
      return {
        ...state,
        parse: { status: 'parsing', done: 0, total: 0 },
        mapping: { ...state.mapping, failed: null },
      };

    case 'MAPPING_FAILED':
      if (!state.mapping) return state;
      return {
        ...state,
        step: 'mapping',
        parse: { status: 'idle' },
        mapping: { ...state.mapping, failed: { field: action.field, header: action.header } },
      };

    case 'SET_MONTH':
      // Zmiana miesiąca liczy raport od nowa z tych samych wierszy (bez ponownego czytania pliku).
      // Liczby wpisane ręcznie zostają przy swoich miesiącach (effects, manualViews).
      if (action.month === state.month) return state;
      return { ...state, month: action.month, incompleteCollapsed: false, pdf: { status: 'idle' } };

    case 'SET_AUTHOR':
      return { ...state, authorName: action.name };

    case 'SET_CLIENT':
      return { ...state, clientName: action.name };

    case 'SET_ACTION':
      return withEffect(state, state.month, action.key, action.value);

    case 'SET_PREVIOUS_ACTION':
      return withEffect(state, addMonths(state.month, -1), action.key, action.value);

    case 'SET_PREVIOUS_VIEWS':
      return {
        ...state,
        manualViews: { ...state.manualViews, [addMonths(state.month, -1)]: action.value },
      };

    case 'SET_KEY_METRIC':
      return { ...state, keyMetric: action.key };

    case 'SET_HEADLINE':
      return { ...state, headline: action.value };

    case 'RESTORE_HEADLINE':
      return { ...state, headline: null };

    case 'SET_COMMENT_WORKED': {
      // Zakreślenie ma sens tylko jako fragment komentarza: znika, gdy tekstu już w nim nie ma.
      const keepMark = state.commentMark !== null && action.value.includes(state.commentMark);
      return { ...state, commentWorked: action.value, commentMark: keepMark ? state.commentMark : null };
    }

    case 'SET_PLAN':
      return { ...state, planNext: action.value };

    case 'SET_MARK': {
      // Jedno zakreślenie na raport (zasada marki): nowe zastępuje poprzednie.
      const text = action.text.trim();
      if (!text || text.length > MARK_MAX || !state.commentWorked.includes(text)) return state;
      return { ...state, commentMark: text };
    }

    case 'CLEAR_MARK':
      return { ...state, commentMark: null };

    case 'KEEP_NOTE':
      return { ...state, incompleteNote: true, incompleteCollapsed: true };

    case 'OPEN_UPLOAD':
      if (state.parse.status === 'parsing') return state;
      return { ...state, step: 'upload', parse: { status: 'idle' } };

    case 'DISCARD_FILE':
      if (!state.base) return state;
      return {
        ...state,
        step: 'effects',
        file: null,
        parse: { status: 'idle' },
        parsed: null,
        mapping: null,
        incompleteCollapsed: false,
      };

    case 'SAVED':
      return { ...state, base: action.data };

    case 'GO_TO':
      if (!state.parsed && !state.base) return state;
      return {
        ...state,
        step: action.step,
        pdf: action.step === 'effects' ? { status: 'idle' } : state.pdf,
      };

    case 'REQUEST_CLIENT_NAME':
      if (!state.parsed) return state;
      return { ...state, step: 'effects', clientNameRequested: true, pdf: { status: 'idle' } };

    case 'PDF_START':
      if (state.pdf.status === 'busy') return state;
      return { ...state, pdf: { status: 'busy' } };

    // Wynik liczy się tylko dla trwającego pobrania: po powrocie do edycji albo zmianie miesiąca w trakcie
    // komunikat „Raport dla … jest gotowy” nie może się pojawić przy danych, które już się zmieniły.
    case 'PDF_SUCCESS':
      if (state.pdf.status !== 'busy') return state;
      return { ...state, pdf: { status: 'done', client: action.client } };

    case 'PDF_ERROR':
      if (state.pdf.status !== 'busy') return state;
      return { ...state, pdf: { status: 'error' } };
  }
}

/**
 * Edycja zapisanego raportu bez pliku (konta, Faza 2). Zapisany ReportData nie ma wierszy eksportu — tylko
 * liczby z podsumowania — więc edytor nie może wywołać computeReport. Te czyste funkcje:
 *
 * - `editsFromReport` wyciągają z zapisanego raportu to, co SMM-owiec wpisuje w edytorze (efekty, liczby
 *   ręczne za M−1, kluczowa liczba, tytuł własny albo z liczb, komentarz, zakreślenie, plan, przypis);
 * - `applyEdits` nakładają te dane na zapisaną bazę i liczą resztę tak samo jak computeReport (kluczowa
 *   liczba, tytuł z szablonu, poprzedni miesiąc plik → historia → pola ręczne, przypisy i ostrzeżenia).
 *
 * Podsumowanie z pliku (publikacje, wyświetlenia, interakcje, obserwujący, najlepsze publikacje) i zakres dat
 * zostają bez zmian. Nowe liczby z pliku daje tylko ponowne wgranie eksportu (computeReport z historią).
 * Bez importu zod: moduł trafia do paczki edytora w przeglądarce.
 */
import type { Warning } from '@/lib/csv/types';
import { compareMonths, daysInMonth, isMonthInProgress } from '@/lib/dates';
import { addMonths, type MonthKey } from '@/lib/i18n/pl';
import {
  headlineFor,
  pickDefaultKeyMetric,
  postsSuggestion,
  resolvePrevious,
  stripEmoji,
  type ComputeSuccess,
  type HistoryInput,
  type PreviousFromFile,
} from './compute';
import { MAX_COUNT } from './limits';
import type { ActionKey, Actions, Branding, KeyMetric, ReportData } from './types';

/** To, co SMM-owiec wpisuje w edytorze (te same pola co w /nowy). */
export type ReportEdits = {
  /** Efekty za miesiąc raportu. */
  actions: Actions;
  /** Liczby wpisane ręcznie za M−1 (pola nieobowiązkowe). Historia i plik mają pierwszeństwo. */
  previous: { actions: Actions; views: number | null };
  /** null = domyślna kluczowa liczba (największy efekt). */
  keyMetric: KeyMetric | null;
  /** null = tytuł z szablonu; tekst = tytuł wpisany przez użytkownika. */
  headline: string | null;
  commentWorked: string;
  commentMark: string | null;
  planNext: string;
  /** Przypis o niepełnym miesiącu w raporcie (domyślnie tak). */
  incompleteNote: boolean;
};

export type ApplyEditsOptions = {
  /** Zapisany raport tego klienta za M−1 (historia). */
  history?: HistoryInput | null;
  /** Chwila edycji: ostrzeżenie „miesiąc jeszcze trwa” tylko wtedy, gdy to nadal prawda. */
  now?: Date;
  /** Nazwa klienta z bazy (domyślnie z zapisanego raportu). */
  client?: { name: string };
  /** Autor z profilu (domyślnie z zapisanego raportu). */
  author?: { name: string; logoUrl?: string };
  branding?: Branding;
};

const ACTION_KEYS: readonly ActionKey[] = ['book', 'call', 'directions'];
const EMPTY_ACTIONS: Actions = Object.freeze({ book: null, call: null, directions: null });
/** Jak w computeReport: w kwietniu 2025 r. Meta zastąpiła Impressions metryką Views. */
const LAST_OLD_METRIC_MONTH: MonthKey = '2025-04';

/** Liczba jak w computeReport: ujemna, nieskończona albo za duża to brak danych, ułamek zaokrąglamy. */
function cleanCount(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0 || value > MAX_COUNT) return null;
  return Math.round(value);
}

function cleanActions(actions: Partial<Actions> | null | undefined): Actions {
  return {
    book: cleanCount(actions?.book),
    call: cleanCount(actions?.call),
    directions: cleanCount(actions?.directions),
  };
}

function cleanText(value: string | null | undefined): string | undefined {
  const trimmed = value == null ? undefined : stripEmoji(value).trim();
  return trimmed ? trimmed : undefined;
}

/** Wybór użytkownika jak w computeReport: efekt bez wartości ustępuje domyślnej kluczowej liczbie. */
function resolveKeyMetric(override: KeyMetric | null, actions: Actions, fallback: KeyMetric): KeyMetric {
  if (override === 'views') return override;
  if (override && actions[override] != null) return override;
  return fallback;
}

function keyValueOf(report: Pick<ReportData, 'keyMetric' | 'summary' | 'actions'>): number | null {
  return report.keyMetric === 'views' ? report.summary.views : report.actions[report.keyMetric];
}

/** Historia z zapisanego raportu za M−1: tylko liczby do porównań (bez publikacji i typów). */
export function historyFromReport(report: ReportData): HistoryInput {
  const { posts, views, interactions, follows } = report.summary;
  return { summary: { posts, views, interactions, follows }, actions: { ...report.actions } };
}

/** Czy historia ma choć jeden efekt, a czy liczby z podsumowania (do decyzji, które pola M−1 pokazać). */
export function historyCoverage(history: HistoryInput | null | undefined): {
  actions: boolean;
  summary: boolean;
} {
  const has = (values: (number | null | undefined)[]) => values.some((v) => cleanCount(v) != null);
  const summary = history?.summary;
  return {
    actions: has(ACTION_KEYS.map((key) => history?.actions?.[key])),
    summary: has([summary?.posts, summary?.views, summary?.interactions, summary?.follows]),
  };
}

/**
 * Pola edytora z zapisanego raportu. Kluczowa liczba równa domyślnej i tytuł równy tytułowi z liczb wracają
 * jako „domyślne” (null), żeby po zmianie liczb szły za nimi — jak w /nowy. Liczby ręczne za M−1:
 * wyświetlenia tylko wtedy, gdy podsumowanie M−1 pochodziło z pól ręcznych; efekty M−1 z raportu (gdy
 * istnieje historia, i tak ma ona pierwszeństwo, a edytor nie pokazuje wtedy tych pól).
 */
export function editsFromReport(base: ReportData): ReportEdits {
  const generated = headlineFor(base.keyMetric, keyValueOf(base), base.period);
  const previous = base.previous;
  return {
    actions: cleanActions(base.actions),
    previous: {
      actions: cleanActions(previous?.actions ?? EMPTY_ACTIONS),
      views: previous?.source === 'manual' ? cleanCount(previous.summary?.views) : null,
    },
    keyMetric: base.keyMetric === pickDefaultKeyMetric(base.actions) ? null : base.keyMetric,
    headline: base.headline === generated ? null : base.headline,
    commentWorked: base.commentWorked ?? '',
    commentMark: base.commentMark ?? null,
    planNext: base.planNext ?? '',
    incompleteNote: true,
  };
}

/**
 * Raport z zapisanej bazy i pól edytora, w kształcie wyniku computeReport (edytor używa jednego widoku dla
 * pliku i zapisu). Liczby z pliku za M−1 (previous.source = 'file') zostają porównaniem; historia i pola
 * ręczne liczą się od nowa w kolejności z PROMPT.md §7.
 */
export function applyEdits(
  base: ReportData,
  edits: ReportEdits,
  options: ApplyEditsOptions = {},
): ComputeSuccess {
  const month = base.period;
  const prevMonth = addMonths(month, -1);
  const now = options.now ?? new Date();

  const fileSummary = base.previous?.source === 'file' ? (base.previous.summary ?? null) : null;
  const previous = resolvePrevious({
    file: fileSummary,
    history: options.history,
    manual: { actions: edits.previous.actions, views: edits.previous.views },
  });

  const actions = cleanActions(edits.actions);
  const defaultKeyMetric = pickDefaultKeyMetric(actions);
  const keyMetric = resolveKeyMetric(edits.keyMetric, actions, defaultKeyMetric);
  const generatedHeadline = headlineFor(
    keyMetric,
    keyValueOf({ keyMetric, summary: base.summary, actions }),
    month,
  );
  const headline = cleanText(edits.headline) ?? generatedHeadline;

  // Przypisy: niepełny miesiąc i dane do dnia zapisu pochodzą z pliku (zostają), zmiana metryki zależy
  // od tego, czy po edycji jest porównanie z M−1.
  const warnings: Warning[] = [];
  const flags: ReportData['flags'] = {};
  const incompleteDays = base.flags.incompleteDays;
  if (incompleteDays) {
    warnings.push({
      code: 'W_INCOMPLETE_MONTH',
      params: { date: base.dataRange.to, days: incompleteDays, monthDays: daysInMonth(month) },
    });
    if (edits.incompleteNote) flags.incompleteDays = incompleteDays;
  }
  if (base.flags.inProgress) {
    if (isMonthInProgress(month, now)) {
      warnings.push({ code: 'W_MONTH_IN_PROGRESS', params: { date: base.dataRange.to } });
    }
    flags.inProgress = true;
  }
  if (
    compareMonths(month, LAST_OLD_METRIC_MONTH) <= 0 ||
    (previous && compareMonths(prevMonth, LAST_OLD_METRIC_MONTH) <= 0)
  ) {
    warnings.push({ code: 'W_METRIC_CHANGE' });
    flags.metricChangeNote = true;
  }

  const commentWorked = cleanText(edits.commentWorked);
  const mark = cleanText(edits.commentMark);
  const commentMark = commentWorked && mark && commentWorked.includes(mark) ? mark : undefined;
  const planNext = cleanText(edits.planNext);

  const client = options.client ?? base.client;
  const author = options.author ?? base.author;
  const logoUrl = author.logoUrl?.trim() || undefined;

  const report: ReportData = {
    period: month,
    client: { name: stripEmoji(client.name).trim() },
    author: { name: stripEmoji(author.name).trim(), ...(logoUrl ? { logoUrl } : {}) },
    branding: options.branding ?? base.branding,
    summary: base.summary,
    actions,
    ...(previous ? { previous } : {}),
    keyMetric,
    headline,
    ...(commentWorked ? { commentWorked } : {}),
    ...(commentMark ? { commentMark } : {}),
    ...(planNext ? { planNext } : {}),
    dataRange: { ...base.dataRange },
    flags,
  };

  const previousFromFile: PreviousFromFile | null = fileSummary
    ? {
        posts: cleanCount(fileSummary.posts) ?? 0,
        views: cleanCount(fileSummary.views),
        interactions: cleanCount(fileSummary.interactions),
        follows: cleanCount(fileSummary.follows),
      }
    : null;

  return {
    ok: true,
    report,
    warnings,
    defaultKeyMetric,
    keyMetricFallback: defaultKeyMetric === 'views',
    generatedHeadline,
    postsSuggestion: postsSuggestion(base.summary.byType),
    previousFromFile,
    previousFileCoverage: fileSummary ? 'full' : 'none',
  };
}

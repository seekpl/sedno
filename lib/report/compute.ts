/**
 * Obliczenia raportu (PROMPT.md §7): z wierszy eksportu (ParsedExport) i trzech liczb efektów składa ReportData.
 * Czyste funkcje bez efektów ubocznych. Wiersze nie opuszczają pamięci przeglądarki — do ReportData trafiają
 * wyłącznie liczby zagregowane i najlepsze publikacje (data, typ, wyświetlenia, interakcje, permalink), nigdy opisy.
 *
 * Zasięgu z publikacji nie sumujemy i nigdzie go nie przenosimy: to unikalne konta, więc suma po postach
 * zawyża wynik. W raporcie są „Wyświetlenia”.
 */
import { buttonNames, report as reportCopy } from '@/lib/copy/report';
import type { FieldKey, ParsedExport, PostRow, PostType, Warning } from '@/lib/csv/types';
import {
  compareMonths,
  daysInMonth,
  isMonthInProgress,
  isMonthOver,
  dayStart,
  lastDayStart,
  monthEnd,
  monthStart,
} from '@/lib/dates';
import { addMonths, formatNumber, monthForms, plural, warsawParts, type MonthKey } from '@/lib/i18n/pl';
import type {
  ActionKey,
  Actions,
  Branding,
  KeyMetric,
  ReportData,
  ReportSummary,
  TopPost,
} from '@/lib/report/types';
import { isAllowedPermalink, MAX_COUNT } from './limits';

/** Pola ręczne za poprzedni miesiąc (opcjonalne, gdy plik nie obejmuje M−1). */
export type PreviousInput = { actions?: Partial<Actions>; views?: number | null; follows?: number | null };

/** Zapisany raport tego klienta za M−1 (konto Solo, Faza 2). */
export type HistoryInput = { summary?: Partial<ReportSummary>; actions?: Partial<Actions> };

export type ComputeInput = {
  parsed: ParsedExport;
  /** 'YYYY-MM' */
  month: MonthKey;
  now: Date;
  client: { name: string };
  author: { name: string; logoUrl?: string };
  branding: Branding;
  actions: Actions;
  /** Pola ręczne za M−1. */
  manualPrevious?: PreviousInput;
  /** Zapisany raport za M−1. */
  history?: HistoryInput | null;
  /** Wybór użytkownika; efekt bez wartości (null) ustępuje domyślnemu. */
  keyMetric?: KeyMetric;
  /** Tytuł użytkownika (przycięty; pusty → tytuł z szablonu). */
  headline?: string;
  commentWorked?: string;
  commentMark?: string;
  planNext?: string;
  /** Przypis o niepełnym miesiącu w raporcie. Domyślnie tak. */
  incompleteNote?: boolean;
};

export type PreviousFromFile = {
  posts: number;
  views: number | null;
  interactions: number | null;
  follows: number | null;
};

export type ComputeSuccess = {
  ok: true;
  report: ReportData;
  /** W_INCOMPLETE_MONTH {date, days, monthDays}, W_MONTH_IN_PROGRESS {date}, W_METRIC_CHANGE. Daty jako ISO. */
  warnings: Warning[];
  defaultKeyMetric: KeyMetric;
  /** Wszystkie trzy efekty to 0 albo brak danych → kluczowe są wyświetlenia (edytor pokazuje editor.keyMetricHint). */
  keyMetricFallback: boolean;
  generatedHeadline: string;
  /** Podpowiedź do pola „Co zadziałało”: „8 rolek, 9 postów, 14 relacji”. */
  postsSuggestion: string;
  /** Liczby z pliku za M−1 (do podpowiedzi w edytorze) albo null, gdy plik nie obejmuje M−1. */
  previousFromFile: PreviousFromFile | null;
  /**
   * Czy plik obejmuje M−1: 'full' — od pierwszych dni miesiąca (porównanie z pliku), 'partial' — zaczyna się
   * później (np. eksport „ostatnie 60 dni” od 13 sierpnia), więc liczb z pliku NIE porównujemy; edytor prosi
   * o liczby ręczne; 'none' — plik nie ma M−1.
   */
  previousFileCoverage: 'full' | 'partial' | 'none';
  /** Pierwsza data w pliku, gdy previousFileCoverage = 'partial' (ISO). */
  previousFilePartialFrom?: string;
};

export type ComputeFailure = {
  ok: false;
  error: { code: 'E_NO_ROWS_IN_MONTH'; months: string[]; range: { from: Date; to: Date } };
};

export type ReportPrevious = NonNullable<ReportData['previous']>;
export type PreviousSource = ReportPrevious['source'];

/** Stała kolejność typów publikacji (podpowiedź „Co zrobiliśmy”, byType). */
const POST_TYPES: readonly PostType[] = ['reel', 'post', 'carousel', 'story', 'other'];
/** Kolejność efektów przy remisie (PROMPT.md §7). */
const ACTION_KEYS: readonly ActionKey[] = ['book', 'call', 'directions'];
const INTERACTION_FIELDS = ['likes', 'comments', 'shares', 'saves'] as const;
/** Kolumny liczbowe sumowane w podsumowaniu. Zasięgu (`reach`) celowo tu nie ma. */
type CountField = 'views' | 'follows' | (typeof INTERACTION_FIELDS)[number];
const PREVIOUS_SUMMARY_KEYS = ['posts', 'views', 'interactions', 'follows'] as const;
const TOP_POSTS = 3;
/** Ostatni miesiąc liczony przed zmianą metryki: w kwietniu 2025 r. Meta zastąpiła Impressions metryką Views. */
const LAST_OLD_METRIC_MONTH: MonthKey = '2025-04';

/**
 * Permalink, który przyjmuje reportDataSchema (lib/report/types.ts, `instagramUrl`). Parser przepuszcza tylko
 * https://www.instagram.com/…; tu dodatkowo odrzucamy znaki spoza schematu, żeby raport zawsze przeszedł
 * walidację. Kopia wzorca, bo import schematu dołączyłby zod do pakietu /nowy — zgodność pilnuje test.
 */

export function isReportPermalink(url: string): boolean {
  return isAllowedPermalink(url);
}

/** Największa liczba, którą przyjmuje reportDataSchema (`count` w lib/report/types.ts). */

/**
 * Liczba z komórki albo z pola: ujemna, nieskończona albo większa niż dopuszcza schemat raportu (np. kolumna
 * z identyfikatorami przypisana ręcznie jako wyświetlenia) to brak danych, ułamek zaokrąglamy.
 */
function cleanCount(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0 || value > MAX_COUNT) return null;
  return Math.round(value);
}

/**
 * Emoji nie mają znaków w krojach marki, więc w PDF byłyby pustymi prostokątami. Usuwamy je z tekstów autora,
 * żeby podgląd i PDF wyglądały tak samo (docs/decisions.md). Polskie litery i interpunkcja zostają.
 */
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u200D\uFE0F\u20E3]/gu;

export function stripEmoji(value: string): string {
  return value.replace(EMOJI, '').replace(/[ \t]{2,}/g, ' ');
}

function cleanText(value: string | undefined): string | undefined {
  const trimmed = value === undefined ? undefined : stripEmoji(value).trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Ile pierwszych dni miesiąca może nie mieć publikacji, a plik nadal uznajemy za obejmujący miesiąc od początku.
 * Eksport nie podaje okresu, więc o pokryciu wnioskujemy z pierwszej publikacji (docs/decisions.md).
 */
const START_GRACE_DAYS = 7;

function startsLate(firstPost: number, month: MonthKey): boolean {
  const start = monthStart(month).getTime();
  if (firstPost < start) return false;
  return warsawParts(new Date(firstPost)).day > START_GRACE_DAYS;
}

function normalizeType(type: PostType): PostType {
  return POST_TYPES.includes(type) ? type : 'other';
}

/** Publikacje z datą w miesiącu M (czas warszawski, granice z lib/dates.ts). */
export function rowsInMonth(rows: readonly PostRow[], month: MonthKey): PostRow[] {
  const from = monthStart(month).getTime();
  const to = monthEnd(month).getTime();
  return rows.filter((row) => {
    const t = row.publishedAt.getTime();
    return t >= from && t <= to;
  });
}

/** Interakcje jednej publikacji: polubienia + komentarze + udostępnienia + zapisania; null, gdy brak wszystkich. */
function postInteractions(row: PostRow): number | null {
  let total: number | null = null;
  for (const field of INTERACTION_FIELDS) {
    const value = cleanCount(row[field]);
    if (value != null) total = (total ?? 0) + value;
  }
  return total;
}

function toTopPost(row: PostRow): TopPost {
  const post: TopPost = {
    publishedAt: row.publishedAt.toISOString(),
    type: normalizeType(row.type),
    views: cleanCount(row.views),
    interactions: postInteractions(row),
  };
  if (row.permalink && isReportPermalink(row.permalink)) post.permalink = row.permalink;
  return post;
}

/** Trzy publikacje o największej liczbie wyświetleń; brak wyświetleń na końcu, przy remisie wcześniejsza data. */
export function pickTopPosts(rows: readonly PostRow[]): TopPost[] {
  return [...rows]
    .sort((a, b) => {
      const va = cleanCount(a.views);
      const vb = cleanCount(b.views);
      if (va !== vb) {
        if (va == null) return 1;
        if (vb == null) return -1;
        return vb - va;
      }
      return a.publishedAt.getTime() - b.publishedAt.getTime();
    })
    .slice(0, TOP_POSTS)
    .map(toTopPost);
}

/**
 * Liczby z pliku dla miesiąca M. Brak kolumny → null („—” w raporcie), pusta komórka w istniejącej
 * kolumnie → 0 w sumie. Gdy w M żadna komórka kolumny nie ma wartości, to też brak danych (null), a nie 0
 * („Brak danych to —, nigdy 0”). Bez wyświetleń nie ma czego uszeregować, więc topPosts jest puste.
 */
export function summarizeMonth(
  rows: readonly PostRow[],
  month: MonthKey,
  fields: readonly FieldKey[],
): ReportSummary {
  const inMonth = rowsInMonth(rows, month);
  const has = (field: FieldKey) => fields.includes(field);
  /** Suma wartości z wybranych kolumn; null, gdy żadna komórka w M nie ma wartości. */
  const sum = (columns: readonly CountField[]) => {
    let total: number | null = null;
    for (const row of inMonth) {
      for (const field of columns) {
        const value = cleanCount(row[field]);
        if (value != null) total = (total ?? 0) + value;
      }
    }
    return total;
  };

  const counts = new Map<PostType, number>();
  for (const row of inMonth) {
    const type = normalizeType(row.type);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const byType: ReportSummary['byType'] = {};
  for (const type of POST_TYPES) {
    const n = counts.get(type);
    if (n) byType[type] = n;
  }

  const views = has('views') ? sum(['views']) : null;

  return {
    posts: inMonth.length,
    byType,
    views,
    interactions: sum(INTERACTION_FIELDS.filter(has)),
    follows: has('follows') ? sum(['follows']) : null,
    topPosts: views == null ? [] : pickTopPosts(inMonth),
  };
}

/** Domyślna kluczowa liczba: efekt o największej wartości (remis: umówienia, telefony, dojazdy), inaczej wyświetlenia. */
export function pickDefaultKeyMetric(actions: Actions): KeyMetric {
  let best: ActionKey | null = null;
  for (const key of ACTION_KEYS) {
    const value = actions[key];
    if (value != null && value > 0 && (best == null || value > (actions[best] ?? 0))) best = key;
  }
  return best ?? 'views';
}

/** Tytuł z szablonu (bez AI). Brak wartości → „Raport za wrzesień”. */
export function headlineFor(key: KeyMetric, value: number | null, month: MonthKey): string {
  const t = reportCopy.headline;
  const forms = monthForms(month);
  if (value == null) return t.fallback(forms.nom);
  const n = formatNumber(value);
  switch (key) {
    case 'views':
      return t.views.template(n, plural(value, t.views.forms), forms.loc);
    case 'book':
      return value === 0
        ? t.zero(buttonNames.book)
        : t.book.template(n, plural(value, t.book.people), plural(value, t.book.verb));
    case 'call':
      return value === 0 ? t.zero(buttonNames.call) : t.call.template(n, plural(value, t.call.forms));
    case 'directions':
      return value === 0
        ? t.zero(buttonNames.directions)
        : t.directions.template(n, plural(value, t.directions.forms));
  }
}

/** „8 rolek, 9 postów, 14 relacji” — stała kolejność typów, tylko niezerowe. Pusty tekst, gdy nic nie ma. */
export function postsSuggestion(byType: Partial<Record<PostType, number>>): string {
  return POST_TYPES.flatMap((type) => {
    const n = byType[type];
    return n != null && n > 0 ? [`${formatNumber(n)} ${plural(n, reportCopy.postTypes[type])}`] : [];
  }).join(', ');
}

/** Liczby z podsumowania za M−1: tylko posts, views, interactions, follows i tylko te z wartością. */
function previousSummary(
  summary: Partial<ReportSummary> | null | undefined,
): Partial<ReportSummary> | undefined {
  if (!summary) return undefined;
  const out: Partial<ReportSummary> = {};
  for (const key of PREVIOUS_SUMMARY_KEYS) {
    const value = cleanCount(summary[key]);
    if (value != null) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

function previousActions(actions: Partial<Actions> | null | undefined): Partial<Actions> | undefined {
  if (!actions) return undefined;
  const out: Partial<Actions> = {};
  for (const key of ACTION_KEYS) {
    const value = cleanCount(actions[key]);
    if (value != null) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

function firstWithValue<T>(candidates: { source: PreviousSource; value: T | undefined }[]) {
  return candidates.find((candidate) => candidate.value !== undefined);
}

/**
 * Poprzedni miesiąc (PROMPT.md §7), osobno dla podsumowania i efektów, w kolejności:
 * plik → zapisany raport → pola ręczne. Plik nie ma efektów, więc te pochodzą z raportu albo z pól ręcznych.
 * Źródło to źródło podsumowania, a gdy go nie ma — źródło efektów. Bez żadnej wartości → undefined
 * (raport pisze „Brak danych z {M−1}”).
 */
export function resolvePrevious(sources: {
  file?: Partial<ReportSummary> | null;
  history?: HistoryInput | null;
  manual?: PreviousInput | null;
}): ReportPrevious | undefined {
  const { file, history, manual } = sources;
  const summary = firstWithValue([
    { source: 'file', value: previousSummary(file) },
    { source: 'history', value: previousSummary(history?.summary) },
    {
      source: 'manual',
      value: previousSummary(manual ? { views: manual.views, follows: manual.follows } : null),
    },
  ]);
  const actions = firstWithValue([
    { source: 'history', value: previousActions(history?.actions) },
    { source: 'manual', value: previousActions(manual?.actions) },
  ]);
  const source = summary?.source ?? actions?.source;
  if (!source) return undefined;
  return {
    source,
    ...(summary ? { summary: summary.value } : {}),
    ...(actions ? { actions: actions.value } : {}),
  };
}

function resolveKeyMetric(override: KeyMetric | undefined, actions: Actions, fallback: KeyMetric): KeyMetric {
  if (override === 'views') return override;
  if (override && actions[override] != null) return override;
  return fallback;
}

export function computeReport(input: ComputeInput): ComputeSuccess | ComputeFailure {
  const { parsed, month, now } = input;
  const monthRows = rowsInMonth(parsed.rows, month);
  if (monthRows.length === 0) {
    return {
      ok: false,
      error: { code: 'E_NO_ROWS_IN_MONTH', months: [...parsed.months], range: parsed.range },
    };
  }

  const summary = summarizeMonth(monthRows, month, parsed.fields);

  // Zakres danych obejmuje co najmniej publikacje z M (gdyby range z parsera był węższy).
  let rangeFrom = parsed.range.from.getTime();
  let rangeTo = parsed.range.to.getTime();
  for (const row of monthRows) {
    const t = row.publishedAt.getTime();
    if (t < rangeFrom) rangeFrom = t;
    if (t > rangeTo) rangeTo = t;
  }
  const start = monthStart(month).getTime();
  const end = monthEnd(month).getTime();
  // Początek: pierwszy dzień miesiąca, chyba że plik wyraźnie zaczyna się później (wtedy dzień pierwszej publikacji).
  const dataFrom = startsLate(rangeFrom, month) ? dayStart(new Date(rangeFrom)) : start;
  const dataTo = Math.max(dataFrom, Math.min(end, rangeTo, now.getTime()));

  // Poprzedni miesiąc.
  const prevMonth = addMonths(month, -1);
  const prevMonthSummary = parsed.months.includes(prevMonth)
    ? summarizeMonth(parsed.rows, prevMonth, parsed.fields)
    : null;
  // Plik obejmuje M−1 tylko wtedy, gdy ma z niego publikacje — niespójna lista `months` nie daje zer w porównaniu —
  // i zaczyna się w pierwszych dniach M−1. Niepełny M−1 zaniżyłby porównanie (np. eksport od 13 sierpnia).
  const prevHasRows = prevMonthSummary !== null && prevMonthSummary.posts > 0;
  const prevPartial = prevHasRows && startsLate(parsed.range.from.getTime(), prevMonth);
  const fileSummary = prevHasRows && !prevPartial ? prevMonthSummary : null;
  const previousFileCoverage: ComputeSuccess['previousFileCoverage'] = prevHasRows
    ? prevPartial
      ? 'partial'
      : 'full'
    : 'none';
  const previousFromFile: PreviousFromFile | null = fileSummary
    ? {
        posts: fileSummary.posts,
        views: fileSummary.views,
        interactions: fileSummary.interactions,
        follows: fileSummary.follows,
      }
    : null;
  const previous = resolvePrevious({
    file: fileSummary,
    history: input.history,
    manual: input.manualPrevious,
  });

  // Kluczowa liczba i tytuł. Efekty czyścimy jak liczby z pliku: NaN, ujemne albo za duże to brak danych.
  const actions: Actions = {
    book: cleanCount(input.actions.book),
    call: cleanCount(input.actions.call),
    directions: cleanCount(input.actions.directions),
  };
  const defaultKeyMetric = pickDefaultKeyMetric(actions);
  const keyMetric = resolveKeyMetric(input.keyMetric, actions, defaultKeyMetric);
  const keyValue = keyMetric === 'views' ? summary.views : actions[keyMetric];
  const generatedHeadline = headlineFor(keyMetric, keyValue, month);
  const headline = cleanText(input.headline) ?? generatedHeadline;

  // Ostrzeżenia i przypisy. Miesiąc minął albo trwa — nigdy oba naraz.
  const warnings: Warning[] = [];
  const flags: ReportData['flags'] = {};
  if (isMonthOver(month, now) && rangeTo < lastDayStart(month).getTime()) {
    const lastDate = new Date(rangeTo);
    // Liczba dni z danymi w M: od początku zakresu (zwykle 1.) do ostatniej daty — zgodnie z przypisem źródła.
    const days = warsawParts(lastDate).day - warsawParts(new Date(dataFrom)).day + 1;
    warnings.push({
      code: 'W_INCOMPLETE_MONTH',
      params: { date: lastDate.toISOString(), days, monthDays: daysInMonth(month) },
    });
    if (input.incompleteNote !== false) flags.incompleteDays = days;
  } else if (isMonthInProgress(month, now)) {
    warnings.push({
      code: 'W_MONTH_IN_PROGRESS',
      params: { date: new Date(Math.min(rangeTo, now.getTime())).toISOString() },
    });
    flags.inProgress = true;
  }
  if (
    compareMonths(month, LAST_OLD_METRIC_MONTH) <= 0 ||
    (previous && compareMonths(prevMonth, LAST_OLD_METRIC_MONTH) <= 0)
  ) {
    warnings.push({ code: 'W_METRIC_CHANGE' });
    flags.metricChangeNote = true;
  }

  // Komentarz: zakreślenie tylko wtedy, gdy to fragment komentarza.
  const commentWorked = cleanText(input.commentWorked);
  const mark = cleanText(input.commentMark);
  const commentMark = commentWorked && mark && commentWorked.includes(mark) ? mark : undefined;
  const planNext = cleanText(input.planNext);
  const logoUrl = input.author.logoUrl?.trim() || undefined;

  const report: ReportData = {
    period: month,
    client: { name: stripEmoji(input.client.name).trim() },
    author: { name: stripEmoji(input.author.name).trim(), ...(logoUrl ? { logoUrl } : {}) },
    branding: input.branding,
    summary,
    actions,
    ...(previous ? { previous } : {}),
    keyMetric,
    headline,
    ...(commentWorked ? { commentWorked } : {}),
    ...(commentMark ? { commentMark } : {}),
    ...(planNext ? { planNext } : {}),
    dataRange: { from: new Date(dataFrom).toISOString(), to: new Date(dataTo).toISOString() },
    flags,
  };

  return {
    ok: true,
    report,
    warnings,
    defaultKeyMetric,
    keyMetricFallback: defaultKeyMetric === 'views',
    generatedHeadline,
    postsSuggestion: postsSuggestion(summary.byType),
    previousFromFile,
    previousFileCoverage,
    ...(prevPartial ? { previousFilePartialFrom: parsed.range.from.toISOString() } : {}),
  };
}

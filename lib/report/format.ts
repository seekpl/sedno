/**
 * Model widoku raportu (PROMPT.md §7, §11): czyste funkcje wspólne dla HTML (<Report>) i PDF (<ReportPdf>).
 * Zwraca gotowe napisy i liczby, żeby oba renderery tylko rozkładały je na stronie i nie liczyły nic same.
 * Spadek ma ten sam spokojny wygląd co wzrost: bez czerwieni i bez strzałek — tu tylko liczby i słowa.
 */
import type { IconName } from '@/lib/brand/svg.generated';
import { report } from '@/lib/copy/report';
import {
  addMonths,
  formatDateRange,
  formatDateRangeShort,
  formatDayMonth,
  formatMonthChange,
  formatNumber,
  monthForms,
  monthLabel,
  parseMonthKey,
  slugify,
} from '@/lib/i18n/pl';
import type { ActionKey, KeyMetric, ReportData } from './types';

/** Kolejność liczb efektów w raporcie (jak w makiecie EkranRaport.html). */
export const ACTION_ORDER: readonly ActionKey[] = ['book', 'call', 'directions'];

/** Ikony liczb raportu (brand/icons). */
export const REPORT_ICONS: Record<KeyMetric | 'follows', IconName> = {
  book: 'booking',
  call: 'phone',
  directions: 'route',
  views: 'eye',
  follows: 'client',
};

export type MetricView = {
  key: KeyMetric;
  icon: IconName;
  label: string;
  /** Liczba po polsku albo „—”, gdy brak danych. */
  value: string;
  /** „sierpień: 17” albo „Brak danych z sierpnia”. */
  delta: string;
  /** „+9% m/m” — tylko przy wyświetleniach i tylko wg reguły z formatMonthChange. */
  change: string | null;
};

export type ReachRow = {
  label: string;
  value: string;
  /** Szerokość słupka w % względem większej liczby z pary (M i M−1). */
  widthPercent: number;
  /** Słupek poprzedniego miesiąca (report-previous). */
  previous: boolean;
  /** Zmiana m/m przy wyświetleniach (gdy nie pokazuje jej już kluczowa liczba). */
  change: string | null;
};

export type CommentSegment = { text: string; marked: boolean };

export type ReportView = {
  /** „Wrzesień 2026” */
  monthLabel: string;
  /** „Co dał Instagram we wrześniu” */
  intro: string;
  /** „dla: Studio Lumi” (telefon) */
  forClient: string;
  /** „Raport miesięczny dla: Studio Lumi” (arkusz A4) */
  forClientLong: string;
  /** „1–30.09.2026” */
  dateRangeShort: string;
  headline: string;
  author: { name: string; initials: string; logoUrl?: string };
  key: MetricView;
  /**
   * Szacowana szerokość kluczowej liczby w em (Bricolage Bold, cyfry tabelaryczne, −0,02 em odstępu).
   * HTML i PDF zmniejszają nią stopień pisma, żeby długa liczba z pętlą mieściła się w kolumnie.
   */
  keyValueEm: number;
  /** Pozostałe liczby efektów: dwie, a gdy kluczowe są wyświetlenia — wszystkie trzy. */
  metrics: MetricView[];
  sections: { worked: string; reach: string; plan: string };
  /** Komentarz „Co zadziałało” w kawałkach; najwyżej jeden zakreślony. null, gdy autor nic nie wpisał. */
  worked: CommentSegment[] | null;
  reach: ReachRow[];
  plan: string | null;
  footnotes: string[];
  showSednoFooter: boolean;
  footer: string;
  /** „Raport za wrzesień 2026 — Studio Lumi” (tytuł strony i metadane PDF). */
  documentTitle: string;
  /** „raport-studio-lumi-2026-09.pdf” */
  fileName: string;
};

/**
 * Inicjały do awatara: pierwsze litery najwyżej dwóch słów, wielkie. „Kadr Social” → „KS”.
 * NFC: nazwa wklejona w rozłożonej postaci („Z” + kropka) ma dać „Ż”, a nie samo „Z”.
 */
export function authorInitials(name: string): string {
  return name
    .normalize('NFC')
    .split(/[\s\-–—_.,/]+/)
    .map((word) => Array.from(word).find((ch) => /[\p{L}\p{N}]/u.test(ch)))
    .filter((ch): ch is string => Boolean(ch))
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase('pl-PL');
}

/**
 * Porównanie z poprzednim miesiącem (PROMPT.md §7). Reguła: gdy za M−1 jest liczba (także 0) —
 * „sierpień: 17”; gdy jej nie ma (brak `previous`, brak pola albo null) — „Brak danych z sierpnia”.
 */
export function previousLine(period: string, previous: number | null | undefined): string {
  const prev = monthForms(addMonths(period, -1));
  return typeof previous === 'number'
    ? report.previousValue(prev.nom, formatNumber(previous))
    : report.noPrevious(prev.gen);
}

/**
 * Komentarz w kawałkach: zakreślacz tylko wokół PIERWSZEGO wystąpienia `mark` (dokładne dopasowanie).
 * Bez `mark` albo gdy fragmentu nie ma w tekście — jeden kawałek bez zakreślenia. Puste kawałki pomijamy.
 */
export function commentSegments(text: string, mark?: string): CommentSegment[] {
  const needle = mark?.trim();
  const index = needle ? text.indexOf(needle) : -1;
  if (!needle || index < 0) return [{ text, marked: false }];
  return [
    { text: text.slice(0, index), marked: false },
    { text: needle, marked: true },
    { text: text.slice(index + needle.length), marked: false },
  ].filter((segment) => segment.text.length > 0);
}

/** Szerokość słupka w procentach względem większej liczby z pary. Niezerowa liczba ma co najmniej 1%. */
export function barWidth(value: number | null | undefined, max: number): number {
  if (value == null || value <= 0 || max <= 0) return 0;
  return Math.max(1, Math.min(100, Math.round((value / max) * 100)));
}

/**
 * Szerokości znaków Bricolage z cyframi tabelarycznymi (em), zmierzone z public/fonts/pdf/*.ttf
 * (Bold i Medium różnią się o < 0,02 em). Wystarczą do liczb raportu: cyfry, spacje, „—”, „−”, „%”, „m/m”.
 */
const ADVANCE_EM: Record<string, number> = {
  ' ': 0.24,
  '\u00a0': 0.24,
  '\u202f': 0.17,
  '%': 0.95,
  m: 0.91,
  '/': 0.36,
  '−': 0.52,
  '+': 0.52,
  '—': 0.79,
};
const DIGIT_EM = 0.61;
const OTHER_EM = 0.65;

/** Szacowana szerokość liczby w em, z odstępem między znakami `tracking` (em na znak). */
export function numberWidthEm(text: string, tracking = 0): number {
  const chars = Array.from(text);
  const em = chars.reduce((sum, ch) => sum + (/\d/.test(ch) ? DIGIT_EM : (ADVANCE_EM[ch] ?? OTHER_EM)), 0);
  return em + tracking * chars.length;
}

/** Odstęp między znakami kluczowej liczby (.sd-key__value w brand/components.css). */
export const KEY_TRACKING_EM = -0.02;

function daysInMonth(period: string): number {
  const { year, month } = parseMonthKey(period);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const nonEmpty = (text: string | undefined): string | null => {
  const trimmed = text?.trim();
  return trimmed ? trimmed : null;
};

export function reportView(data: ReportData): ReportView {
  const { period, summary, actions, previous, keyMetric, flags } = data;
  const { year } = parseMonthKey(period);
  const month = monthForms(period);
  const prevMonth = monthForms(addMonths(period, -1));
  const from = new Date(data.dataRange.from);
  const to = new Date(data.dataRange.to);

  const prevViews = previous?.summary?.views;
  const prevFollows = previous?.summary?.follows;
  const viewsChange = formatMonthChange(summary.views, prevViews ?? null);

  const actionView = (key: ActionKey, label: string): MetricView => ({
    key,
    icon: REPORT_ICONS[key],
    label,
    value: formatNumber(actions[key]),
    delta: previousLine(period, previous?.actions?.[key]),
    change: null,
  });

  const key: MetricView =
    keyMetric === 'views'
      ? {
          key: 'views',
          icon: REPORT_ICONS.views,
          label: report.views,
          value: formatNumber(summary.views),
          delta: previousLine(period, prevViews),
          change: viewsChange,
        }
      : actionView(keyMetric, report.actionLabel(keyMetric));

  const metrics = ACTION_ORDER.filter((k) => k !== keyMetric).map((k) =>
    actionView(k, report.actionShort(k)),
  );

  // Zasięg: wyświetlenia M i M−1, nowi obserwujący M i M−1 (tylko gdy plik ma tę kolumnę).
  const pair = (
    label: string,
    current: number | null,
    prev: number | null | undefined,
    change: string | null,
  ) => {
    const max = Math.max(current ?? 0, prev ?? 0);
    const rows: ReachRow[] = [
      { label, value: formatNumber(current), widthPercent: barWidth(current, max), previous: false, change },
    ];
    if (typeof prev === 'number') {
      rows.push({
        label: prevMonth.nom,
        value: formatNumber(prev),
        widthPercent: barWidth(prev, max),
        previous: true,
        change: null,
      });
    }
    return rows;
  };
  const reach = [
    // Zmiana m/m pokazuje się raz: przy kluczowej liczbie, gdy są nią wyświetlenia, w przeciwnym razie tutaj.
    ...pair(report.views, summary.views, prevViews, keyMetric === 'views' ? null : viewsChange),
    ...(summary.follows !== null ? pair(report.follows, summary.follows, prevFollows, null) : []),
  ];

  const worked = nonEmpty(data.commentWorked);

  const footnotes = [report.sourceNote(formatDateRange(from, to))];
  if (flags.metricChangeNote) footnotes.push(report.metricNote);
  if (flags.incompleteDays) {
    footnotes.push(report.incompleteNote(month.gen, flags.incompleteDays, daysInMonth(period)));
  }
  if (flags.inProgress) footnotes.push(report.inProgressNote(formatDayMonth(to)));

  const authorName = data.author.name.trim();

  return {
    monthLabel: monthLabel(period),
    intro: report.intro(month.loc),
    forClient: report.forClient(data.client.name),
    forClientLong: report.forClientLong(data.client.name),
    dateRangeShort: formatDateRangeShort(from, to),
    headline: data.headline,
    author: {
      name: authorName,
      initials: authorInitials(authorName),
      ...(data.author.logoUrl ? { logoUrl: data.author.logoUrl } : {}),
    },
    key,
    keyValueEm: Math.round(numberWidthEm(key.value, KEY_TRACKING_EM) * 1000) / 1000,
    metrics,
    sections: {
      worked: report.sections.worked,
      reach: report.sections.reach,
      plan: report.sections.plan(nextMonthNom(period)),
    },
    worked: worked ? commentSegments(worked, data.commentMark) : null,
    reach,
    plan: nonEmpty(data.planNext),
    footnotes,
    showSednoFooter: data.branding === 'sedno-footer',
    footer: report.footer,
    documentTitle: report.documentTitle(month.nom, year, data.client.name),
    fileName: `raport-${slugify(data.client.name)}-${period}.pdf`,
  };
}

/** „Plan na październik” dotyczy miesiąca PO raporcie (M+1), w mianowniku. */
function nextMonthNom(period: string): string {
  return monthForms(addMonths(period, 1)).nom;
}

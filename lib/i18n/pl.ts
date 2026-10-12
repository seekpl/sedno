/**
 * Polska odmiana i formaty (PROMPT.md §14). Jedyne miejsce, które składa liczby, daty i odmianę.
 */

/** Odmiana liczebników: 1 osoba, 2–4 osoby, 5–21 osób, 22–24 osoby, 25 osób… */
export const plural = (n: number, [one, few, many]: readonly [string, string, string]): string => {
  const abs = Math.abs(n);
  const n10 = abs % 10,
    n100 = abs % 100;
  if (abs === 1) return one;
  if (Number.isInteger(abs) && n10 >= 2 && n10 <= 4 && !(n100 >= 12 && n100 <= 14)) return few;
  return many;
};

type MonthForms = {
  /** „Plan na wrzesień” */
  nom: string;
  /** „z września”, „1–30 września” */
  gen: string;
  /** „porównanie z wrześniem” */
  ins: string;
  /** „we wrześniu” (z przyimkiem) */
  loc: string;
  /** Skrót do wąskiego przełącznika miesiąca */
  short: string;
};

export const MONTHS: readonly MonthForms[] = [
  { nom: 'styczeń', gen: 'stycznia', ins: 'styczniem', loc: 'w styczniu', short: 'sty' },
  { nom: 'luty', gen: 'lutego', ins: 'lutym', loc: 'w lutym', short: 'lut' },
  { nom: 'marzec', gen: 'marca', ins: 'marcem', loc: 'w marcu', short: 'mar' },
  { nom: 'kwiecień', gen: 'kwietnia', ins: 'kwietniem', loc: 'w kwietniu', short: 'kwi' },
  { nom: 'maj', gen: 'maja', ins: 'majem', loc: 'w maju', short: 'maj' },
  { nom: 'czerwiec', gen: 'czerwca', ins: 'czerwcem', loc: 'w czerwcu', short: 'cze' },
  { nom: 'lipiec', gen: 'lipca', ins: 'lipcem', loc: 'w lipcu', short: 'lip' },
  { nom: 'sierpień', gen: 'sierpnia', ins: 'sierpniem', loc: 'w sierpniu', short: 'sie' },
  { nom: 'wrzesień', gen: 'września', ins: 'wrześniem', loc: 'we wrześniu', short: 'wrz' },
  { nom: 'październik', gen: 'października', ins: 'październikiem', loc: 'w październiku', short: 'paź' },
  { nom: 'listopad', gen: 'listopada', ins: 'listopadem', loc: 'w listopadzie', short: 'lis' },
  { nom: 'grudzień', gen: 'grudnia', ins: 'grudniem', loc: 'w grudniu', short: 'gru' },
];

/** 'YYYY-MM' */
export type MonthKey = string;

export function parseMonthKey(key: MonthKey): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`Niepoprawny miesiąc: ${key}`);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`Niepoprawny miesiąc: ${key}`);
  return { year: Number(m[1]), month };
}

export function isMonthKey(key: string | null | undefined): key is MonthKey {
  if (!key) return false;
  try {
    parseMonthKey(key);
    return true;
  } catch {
    return false;
  }
}

export function monthKey(year: number, month: number): MonthKey {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function addMonths(key: MonthKey, delta: number): MonthKey {
  const { year, month } = parseMonthKey(key);
  const index = year * 12 + (month - 1) + delta;
  return monthKey(Math.floor(index / 12), (index % 12) + 1);
}

export function monthForms(key: MonthKey): MonthForms {
  return MONTHS[parseMonthKey(key).month - 1]!;
}

export const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase('pl-PL') + s.slice(1);

/** „Wrzesień 2026” */
export function monthLabel(key: MonthKey): string {
  return `${capitalize(monthForms(key).nom)} ${parseMonthKey(key).year}`;
}

/** „Wrz 2026” */
export function monthLabelShort(key: MonthKey): string {
  return `${capitalize(monthForms(key).short)} ${parseMonthKey(key).year}`;
}

const numberFormat = new Intl.NumberFormat('pl-PL');
const currencyFormat = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' });

/** Liczba po polsku: 1840, 12 480 (twarda spacja od pięciu cyfr), minus jako „−”. Brak danych to „—”. */
export function formatNumber(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return numberFormat.format(n).replace(/-/g, '−');
}

/** Kwota w złotych: „11,07 zł”. */
export function formatCurrency(amount: number): string {
  return currencyFormat.format(amount).replace(/-/g, '−');
}

/** Rozmiar pliku: „48 KB”, „1,2 MB”. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${formatNumber(Math.max(1, Math.round(bytes / 1024)))} KB`;
  const mb = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024));
  return `${mb} MB`;
}

/** Strefa czasowa wszystkich dat w raporcie (PROMPT.md §6). */
export const TIME_ZONE = 'Europe/Warsaw';

/** Dzień, miesiąc i rok daty w strefie Europe/Warsaw. */
const warsawDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function warsawParts(date: Date): { year: number; month: number; day: number } {
  // Jeden formatter na moduł: tworzenie Intl.DateTimeFormat przy każdym wywołaniu kosztuje ~0,1 ms
  // (20 000 wierszy → ~2 s).
  const parts = warsawDateFormat.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** 'YYYY-MM' daty w strefie Europe/Warsaw. */
export function warsawMonthKey(date: Date): MonthKey {
  const { year, month } = warsawParts(date);
  return monthKey(year, month);
}

/** „27 września” (bez roku). */
export function formatDayMonth(date: Date): string {
  const { month, day } = warsawParts(date);
  return `${day} ${MONTHS[month - 1]!.gen}`;
}

/** „27 września 2026”. */
export function formatDate(date: Date): string {
  return `${formatDayMonth(date)} ${warsawParts(date).year}`;
}

/**
 * Zakres dat z półpauzą (U+2013): „1–30 września 2026”, „28 sierpnia – 3 września 2026”,
 * „28 grudnia 2025 – 3 stycznia 2026”.
 */
export function formatDateRange(from: Date, to: Date): string {
  const a = warsawParts(from);
  const b = warsawParts(to);
  if (a.year === b.year && a.month === b.month) {
    return a.day === b.day ? formatDate(from) : `${a.day}–${b.day} ${MONTHS[b.month - 1]!.gen} ${b.year}`;
  }
  if (a.year === b.year) return `${formatDayMonth(from)} – ${formatDate(to)}`;
  return `${formatDate(from)} – ${formatDate(to)}`;
}

/** Krótki zakres do nagłówka PDF: „1–30.09.2026”. */
export function formatDateRangeShort(from: Date, to: Date): string {
  const a = warsawParts(from);
  const b = warsawParts(to);
  const dm = (p: { day: number; month: number }) => `${p.day}.${String(p.month).padStart(2, '0')}`;
  if (a.year === b.year && a.month === b.month) return `${a.day}–${dm(b)}.${b.year}`;
  return `${dm(a)}.${a.year}–${dm(b)}.${b.year}`;
}

/**
 * Zmiana procentowa m/m: „+9% m/m”, „−4% m/m” (prawdziwy minus). Zaokrąglenie do całości.
 * Zwraca null, gdy zmiany nie pokazujemy (PROMPT.md §7: poprzedni miesiąc ≥ 1000 i |zmiana| ≥ 1%).
 */
export function formatMonthChange(current: number | null, previous: number | null): string | null {
  if (current == null || previous == null || previous < 1000) return null;
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 1) return null;
  const rounded = Math.round(Math.abs(change));
  return `${change > 0 ? '+' : '−'}${formatNumber(rounded)}% m/m`;
}

/** Slug do nazwy pliku: „Bistro Pod Lipą” → „bistro-pod-lipa”. */
export function slugify(text: string): string {
  const slug = text
    .toLocaleLowerCase('pl-PL')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'klient';
}

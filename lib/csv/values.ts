/**
 * Wartości komórek eksportu: liczby, daty, typ publikacji i permalink (PROMPT.md §6).
 * Brak danych to null, nigdy 0. Bez bibliotek dat: strefa Europe/Warsaw przez Intl.
 */
import { TIME_ZONE, monthKey } from '@/lib/i18n/pl';
import { normalizeHeader } from './columns';
import type { PostType } from './types';
import { isAllowedPermalink } from '@/lib/report/limits';

/* ───────────────────────── liczby ───────────────────────── */

/** Komórki oznaczające brak danych (po usunięciu spacji, bez rozróżniania wielkości liter). */
const NO_DATA = new Set(['', '-', '–', '—', '−', 'n/a', 'na', 'brak', 'brakdanych']);

/**
 * Liczba z komórki. Usuwa spacje, twarde spacje (U+00A0, U+202F). „1 234”, „1,234” i „1.234” to tysiące,
 * gdy po jedynym separatorze są dokładnie 3 cyfry (a przed nim 1–3 cyfry bez zera na początku);
 * „1.234,5” i „1,234.5” → 1234.5; „12,5” → 12.5. Pusta komórka, „-”, „—”, „N/A” → null (nie 0).
 * Liczby ujemne → null: w eksporcie są tylko liczniki, a ujemny licznik oznacza uszkodzone dane.
 */
export function parseNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = raw.replace(/\s/g, '');
  if (NO_DATA.has(s.toLowerCase())) return null;
  if (/^[-−]/.test(s)) return null;
  const v = s.replace(/^\+/, '');

  if (/^\d+$/.test(v)) return Number(v);

  // Zapis wykładniczy z Excela („1.2E+04”).
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(v)) return finite(Number(v));

  const hasDot = v.includes('.');
  const hasComma = v.includes(',');

  if (hasDot && hasComma) {
    // Ostatni separator to część dziesiętna, drugi grupuje tysiące.
    const decimal = v.lastIndexOf('.') > v.lastIndexOf(',') ? '.' : ',';
    const group = decimal === '.' ? ',' : '.';
    const pattern = new RegExp(`^\\d{1,3}(\\${group}\\d{3})+\\${decimal}\\d+$`);
    if (!pattern.test(v)) return null;
    return finite(Number(v.split(group).join('').replace(decimal, '.')));
  }

  if (hasDot || hasComma) {
    const sep = hasDot ? '.' : ',';
    const parts = v.split(sep);
    if (parts.some((p) => !/^\d+$/.test(p))) return null;
    if (parts.length > 2) {
      // Kilka separatorów: wyłącznie grupy tysięcy („1.234.567”).
      const [head, ...groups] = parts;
      if (!/^[1-9]\d{0,2}$/.test(head!) || groups.some((g) => g.length !== 3)) return null;
      return Number(parts.join(''));
    }
    const [head, tail] = parts as [string, string];
    if (tail.length === 3 && /^[1-9]\d{0,2}$/.test(head)) return Number(head + tail);
    return finite(Number(`${head}.${tail}`));
  }

  return null;
}

function finite(n: number): number | null {
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/* ───────────────────────── daty ───────────────────────── */

/** Kolejność dnia i miesiąca w datach z „/” lub „.” rozstrzygana dla całej kolumny. */
export type DateOrder = 'dmy' | 'mdy';

const ISO =
  /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;
const YMD_SLASH = /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const XXY =
  /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap])\.?m\.?)?)?$/i;

/**
 * Kolejność pól w kolumnie dat na podstawie wartości: pierwsza liczba > 12 ⇒ dzień najpierw; druga > 12 ⇒
 * miesiąc najpierw. Gdy wartości tego nie rozstrzygają: „/” ⇒ miesiąc najpierw (eksport amerykański),
 * „.” i „-” ⇒ dzień najpierw. Zwraca null, gdy w kolumnie nie ma dat z „/”, „.” ani „-”.
 */
export function detectDateOrder(values: Iterable<string>): DateOrder | null {
  let firstOver12 = 0;
  let secondOver12 = 0;
  let separator: string | null = null;
  for (const value of values) {
    const m = XXY.exec(value.trim());
    if (!m) continue;
    separator ??= m[2]!;
    if (Number(m[1]) > 12) firstOver12++;
    if (Number(m[3]) > 12) secondOver12++;
  }
  if (separator === null) return null;
  if (firstOver12 > 0 && secondOver12 === 0) return 'dmy';
  if (secondOver12 > 0 && firstOver12 === 0) return 'mdy';
  // Brak rozstrzygnięcia albo sprzeczne wartości: domyślna kolejność dla separatora.
  return separator === '/' ? 'mdy' : 'dmy';
}

const offsetFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Przesunięcie Europe/Warsaw względem UTC (ms) dokładnie w danej chwili (pełne sekundy). */
function offsetAt(at: number): number {
  const parts = offsetFormat.formatToParts(new Date(at));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return wall - Math.floor(at / 1000) * 1000;
}

/**
 * Pamięć przesunięć. Doba UTC bez zmiany czasu ma jedno przesunięcie (sprawdzamy jej początek i koniec —
 * w Warszawie czas zmienia się najwyżej raz na dobę); w dobie ze zmianą liczymy dla pełnej godziny UTC,
 * bo zmiany w Warszawie zachodzą o pełnej godzinie (01:00 UTC).
 */
const dayOffsets = new Map<number, number | null>();
const hourOffsets = new Map<number, number>();

/** Przesunięcie Europe/Warsaw względem UTC (ms) w danej chwili. */
function warsawOffset(instant: number): number {
  const day = Math.floor(instant / 86_400_000);
  let offset = dayOffsets.get(day);
  if (offset === undefined) {
    const start = offsetAt(day * 86_400_000);
    const end = offsetAt((day + 1) * 86_400_000 - 1000);
    offset = start === end ? start : null;
    if (dayOffsets.size > 20_000) dayOffsets.clear();
    dayOffsets.set(day, offset);
  }
  if (offset !== null) return offset;
  const hour = Math.floor(instant / 3_600_000);
  let hourly = hourOffsets.get(hour);
  if (hourly === undefined) {
    hourly = offsetAt(hour * 3_600_000);
    if (hourOffsets.size > 20_000) hourOffsets.clear();
    hourOffsets.set(hour, hourly);
  }
  return hourly;
}

/**
 * Miesiąc 'YYYY-MM' chwili w strefie Europe/Warsaw — to samo co warsawMonthKey z lib/i18n/pl.ts
 * (test pilnuje zgodności), ale z pamięcią przesunięć. warsawMonthKey tworzy nowy Intl.DateTimeFormat
 * przy każdym wywołaniu (~0,1 ms), co przy 20 000 wierszy daje ~2 s.
 */
export function warsawMonthKeyFast(date: Date): string {
  const wall = new Date(date.getTime() + warsawOffset(date.getTime()));
  return monthKey(wall.getUTCFullYear(), wall.getUTCMonth() + 1);
}

/**
 * Czas „ścienny” w Warszawie → chwila. Zasada jak w Temporal „compatible”: godzina, która występuje
 * dwa razy (koniec października), oznacza wcześniejszą chwilę (czas letni); godzina, której nie ma
 * (koniec marca, 2:00–3:00), przesuwa się do przodu o godzinę.
 */
export function warsawWallClockToDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const local = Date.UTC(year, month - 1, day, hour, minute, second);
  const before = warsawOffset(local - 86_400_000);
  const after = warsawOffset(local + 86_400_000);
  const candidates = [...new Set([before, after])]
    .map((offset) => local - offset)
    .filter((instant) => local - warsawOffset(instant) === instant)
    .sort((a, b) => a - b);
  return new Date(candidates[0] ?? local - before);
}

function validParts(y: number, mo: number, d: number, h: number, mi: number, s: number): boolean {
  if (y < 1970 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false;
  if (d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return false;
  return h >= 0 && h <= 23 && mi >= 0 && mi <= 59 && s >= 0 && s <= 59;
}

function offsetMs(zone: string): number {
  if (/^z$/i.test(zone)) return 0;
  const m = /^([+-])(\d{2}):?(\d{2})?$/.exec(zone);
  if (!m) return NaN;
  const hours = Number(m[2]);
  const mins = Number(m[3] ?? 0);
  if (hours > 14 || mins > 59) return NaN;
  const minutes = hours * 60 + mins;
  return (m[1] === '-' ? -1 : 1) * minutes * 60_000;
}

/**
 * Data z komórki: ISO (z przesunięciem albo bez), „YYYY/MM/DD”, „MM/DD/YYYY HH:mm”, „DD/MM/YYYY”,
 * „DD.MM.YYYY HH:mm” (sekundy opcjonalne, AM/PM opcjonalne). Godzina bez strefy to czas w Warszawie;
 * jawne przesunięcie jest respektowane. `order` rozstrzyga datę niejednoznaczną (z detectDateOrder).
 * Zwraca null, gdy komórki nie da się odczytać (np. „Lifetime”, „Łącznie”).
 */
export function parseDate(raw: string | null | undefined, order: DateOrder | null = null): Date | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (s === '') return null;

  let m = ISO.exec(s);
  if (m) {
    const [y, mo, d, h, mi, sec] = [m[1], m[2], m[3], m[4], m[5], m[6]].map((x) => Number(x ?? 0)) as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    if (!validParts(y, mo, d, h, mi, sec)) return null;
    if (m[7]) {
      const offset = offsetMs(m[7]);
      if (Number.isNaN(offset)) return null;
      return new Date(Date.UTC(y, mo - 1, d, h, mi, sec) - offset);
    }
    return warsawWallClockToDate(y, mo, d, h, mi, sec);
  }

  m = YMD_SLASH.exec(s);
  if (m) {
    const [y, mo, d, h, mi, sec] = [m[1], m[2], m[3], m[4], m[5], m[6]].map((x) => Number(x ?? 0)) as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    return validParts(y, mo, d, h, mi, sec) ? warsawWallClockToDate(y, mo, d, h, mi, sec) : null;
  }

  m = XXY.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[3]);
    const effective = order ?? (m[2] === '/' ? 'mdy' : 'dmy');
    const [mo, d] = effective === 'mdy' ? [a, b] : [b, a];
    const y = Number(m[4]);
    let h = Number(m[5] ?? 0);
    const mi = Number(m[6] ?? 0);
    const sec = Number(m[7] ?? 0);
    const ampm = m[8]?.toLowerCase();
    if (ampm) {
      if (h < 1 || h > 12) return null;
      h = (h % 12) + (ampm === 'p' ? 12 : 0);
    }
    return validParts(y, mo, d, h, mi, sec) ? warsawWallClockToDate(y, mo, d, h, mi, sec) : null;
  }

  return null;
}

/* ───────────────────────── typ publikacji ───────────────────────── */

/**
 * Typ publikacji z wartości po polsku lub angielsku („IG reel”, „Rolka na Instagramie”, „Karuzela”…).
 * Kolejność sprawdzeń ma znaczenie: „Post z karuzelą” to karuzela, nie post.
 */
export function normalizeType(raw: string | null | undefined): PostType {
  if (!raw) return 'other';
  const v = normalizeHeader(raw);
  if (/reel|rolk/.test(v)) return 'reel';
  if (/carousel|karuzel|album/.test(v)) return 'carousel';
  if (/stor(y|ies)|relacj/.test(v)) return 'story';
  if (/image|photo|zdjec|obraz|video|wideo|film|post/.test(v)) return 'post';
  return 'other';
}

/* ───────────────────────── permalink ───────────────────────── */

/**
 * Permalink tylko w postaci https://www.instagram.com/… (docs/decisions.md p. 16). Wszystko inne —
 * javascript:, http:, inne domeny, instagram.com bez www, znaki spoza listy — odrzucamy (undefined),
 * żeby żaden adres z pliku nie trafił do atrybutu href.
 */
export function sanitizePermalink(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const v = raw.trim();
  if (!v.startsWith('https://www.instagram.com/')) return undefined;
  return isAllowedPermalink(v) ? v : undefined;
}

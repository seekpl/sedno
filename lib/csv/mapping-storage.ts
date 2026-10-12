/**
 * Zapamiętane mapowanie ręczne kolumn (PROMPT.md §6): oryginalny nagłówek → pole, w localStorage tej
 * przeglądarki. Zapisujemy wyłącznie teksty nagłówków i nazwy pól — nigdy wartości komórek.
 * Każdy dostęp w try/catch: tryb prywatny, zablokowane dane witryny i SSR zwracają puste mapowanie.
 */
import { isFieldKey } from './columns';
import type { ColumnMapping, FieldKey } from './types';

export const COLUMN_MAPPING_KEY = 'sedno.columnMapping.v1';

/** Limity chronią przed zapisaniem czegoś, co nie jest nagłówkiem (np. długiego tekstu z komórki). */
const MAX_HEADER_LENGTH = 120;
const MAX_ENTRIES = 100;

/**
 * Mapa zamiast przypisań do obiektu: nagłówek „__proto__” nie może zmienić prototypu ani zniknąć,
 * a Object.fromEntries tworzy zwykłe własne pola.
 */
function sanitize(value: unknown): ColumnMapping {
  const out = new Map<string, FieldKey>();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  for (const [header, field] of Object.entries(value as Record<string, unknown>)) {
    const key = header.trim();
    if (key === '' || key.length > MAX_HEADER_LENGTH || !isFieldKey(field)) continue;
    out.set(key, field);
    if (out.size >= MAX_ENTRIES) break;
  }
  return Object.fromEntries(out);
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadColumnMapping(): ColumnMapping {
  const store = storage();
  if (!store) return {};
  try {
    const raw = store.getItem(COLUMN_MAPPING_KEY);
    return raw ? sanitize(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

/** Dopisuje mapowanie do zapamiętanego (nowe wpisy nadpisują stare dla tego samego nagłówka). */
export function saveColumnMapping(mapping: ColumnMapping): void {
  const store = storage();
  if (!store) return;
  try {
    // Nowe wpisy na początku, żeby limit wpisów nigdy nie odciął świeżo wybranych kolumn.
    const next = sanitize(mapping);
    // Object.hasOwn, nie „in”: nagłówki „constructor” czy „toString” nie mogą udawać nowych wpisów.
    const previous = Object.entries(loadColumnMapping()).filter(([header]) => !Object.hasOwn(next, header));
    const merged = sanitize({ ...next, ...Object.fromEntries(previous) });
    store.setItem(COLUMN_MAPPING_KEY, JSON.stringify(merged));
  } catch {
    // Brak miejsca albo zablokowany localStorage: mapowanie działa tylko w tej sesji.
  }
}

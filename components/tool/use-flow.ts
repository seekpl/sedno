'use client';

import { useCallback, useEffect, useId, useMemo, useRef, type Dispatch, type RefObject } from 'react';
import { track } from '@/lib/analytics/client';
import { parseFileInWorker } from '@/lib/csv/client';
import { loadColumnMapping, saveColumnMapping } from '@/lib/csv/mapping-storage';
import type { ColumnMapping, ParseResult, RequiredField } from '@/lib/csv/types';
import { REQUIRED_FIELDS } from './MappingStep';
import type { FlowIds } from './parts';
import type { ToolAction } from './state';

/**
 * Wspólne zachowanie przepływu z plikiem — narzędzia /nowy i edytora raportu z kontem: identyfikatory pól,
 * fokus po zmianie widoku i wczytanie pliku w Web Workerze (z mapowaniem kolumn). Plik żyje wyłącznie
 * w pamięci karty; do analityki trafiają tylko liczby (wiersze, miesiące, czas) i kody błędów.
 */

/** Granice schematu zdarzenia csv_parsed: czas parsowania (ms) i liczba miesięcy w pliku. */
const MAX_PARSE_MS = 600_000;
const MAX_MONTHS = 120;

/** Zapamiętane mapowanie zawężone do nagłówków tego pliku; undefined, gdy nie wskazuje żadnego pola wymaganego. */
function rememberedMapping(headers: readonly string[]): ColumnMapping | undefined {
  const remembered = loadColumnMapping();
  const own = new Set(headers.map((h) => h.trim()));
  const entries = Object.entries(remembered).filter(([header]) => own.has(header));
  const required = new Set<string>(REQUIRED_FIELDS);
  if (!entries.some(([, field]) => required.has(field))) return undefined;
  return Object.fromEntries(entries);
}

/** Zapamiętany wybór dla ekranu „Przypisz kolumny”: nagłówek tego pliku → pole wymagane. */
export function rememberedSelection(headers: readonly string[]): Partial<Record<RequiredField, string>> {
  const mapping = rememberedMapping(headers) ?? {};
  const selection: Partial<Record<RequiredField, string>> = {};
  for (const [header, field] of Object.entries(mapping)) {
    if ((field === 'publishedAt' || field === 'views') && !selection[field]) selection[field] = header;
  }
  return selection;
}

/** Stałe identyfikatory elementów, na które przepływ przenosi fokus. */
export function useFlowIds(): FlowIds {
  const uid = useId();
  return useMemo<FlowIds>(
    () => ({
      heading: `${uid}-heading`,
      client: `${uid}-client`,
      headline: `${uid}-headline`,
      worked: `${uid}-worked`,
      markButton: `${uid}-mark`,
      note: `${uid}-note`,
      mapping: (field) => `${uid}-map-${field}`,
    }),
    [uid],
  );
}

/**
 * Fokus na h1 po każdej zmianie widoku (WCAG 2.4.3), chyba że zmianę wywołał przełącznik miesiąca
 * (`keepFocusRef`) albo działanie wskazało inny element (`pendingFocusRef` = id elementu).
 */
export function useViewFocus(
  view: string,
  headingId: string,
): { pendingFocusRef: RefObject<string | null>; keepFocusRef: RefObject<boolean> } {
  /** Element, na który przenieść fokus po najbliższym renderze (id). */
  const pendingFocusRef = useRef<string | null>(null);
  /** Zmiana miesiąca z paska: fokus zostaje na przełączniku, nawet gdy zmienia się widok. */
  const keepFocusRef = useRef(false);
  const lastView = useRef(view);
  useEffect(() => {
    if (view !== lastView.current) {
      lastView.current = view;
      if (!keepFocusRef.current) pendingFocusRef.current ??= headingId;
    }
    keepFocusRef.current = false;
    // Cel czeka, aż pojawi się w DOM (np. efekt poprzedniego renderu może przyjść przed nowym widokiem).
    const target = pendingFocusRef.current && document.getElementById(pendingFocusRef.current);
    if (target) {
      pendingFocusRef.current = null;
      target.focus();
    }
  });
  return { pendingFocusRef, keepFocusRef };
}

/**
 * Wczytanie pliku: parser w Web Workerze, po E_MISSING_COLUMNS ponowna próba z zapamiętanym mapowaniem,
 * ręczne mapowanie kolumn. Wynik starszego parsowania (np. po wybraniu kolejnego pliku) jest pomijany.
 */
export function useExportParser({
  dispatch,
  ids,
  pendingFocusRef,
}: {
  dispatch: Dispatch<ToolAction>;
  ids: FlowIds;
  pendingFocusRef: RefObject<string | null>;
}) {
  /** Wybrany plik — tylko w pamięci, do ponownego parsowania z mapowaniem kolumn. */
  const fileRef = useRef<File | null>(null);
  /** Numer bieżącego parsowania: wynik starszego (np. po wybraniu kolejnego pliku) jest pomijany. */
  const parseToken = useRef(0);

  /** Wynik parsowania: tylko liczby do analityki (wiersze, miesiące, czas), nigdy treść. */
  const finishParse = useCallback(
    (parsed: ParseResult, ms: number) => {
      if (parsed.ok) {
        dispatch({ type: 'PARSE_SUCCESS', data: parsed.data });
        track('csv_parsed', {
          rows: parsed.data.rows.length,
          months: Math.min(parsed.data.months.length, MAX_MONTHS),
          ms: Math.min(Math.max(0, Math.round(ms)), MAX_PARSE_MS),
        });
      } else {
        dispatch({ type: 'PARSE_ERROR', error: parsed.error });
        track('csv_error', { code: parsed.error.code });
      }
    },
    [dispatch],
  );

  const handleFile = useCallback(
    (file: File) => {
      fileRef.current = file;
      const token = ++parseToken.current;
      const current = () => token === parseToken.current;
      const onProgress = (done: number, total: number) => {
        if (current()) dispatch({ type: 'PARSE_PROGRESS', done, total });
      };
      pendingFocusRef.current = ids.heading;
      dispatch({ type: 'FILE_SELECTED', file: { name: file.name, size: file.size } });

      void (async () => {
        try {
          // Pierwsza próba bez zapamiętanego mapowania, żeby stary wybór nie nadpisał rozpoznanych kolumn.
          let { result: parsed, ms } = await parseFileInWorker(file, { onProgress });
          if (!current()) return;
          if (!parsed.ok && parsed.error.code === 'E_MISSING_COLUMNS') {
            const remembered = rememberedMapping(parsed.error.headers);
            if (remembered) {
              const retry = await parseFileInWorker(file, { mapping: remembered, onProgress });
              if (!current()) return;
              if (retry.result.ok) {
                parsed = retry.result;
                ms += retry.ms;
              }
            }
          }
          finishParse(parsed, ms);
        } catch {
          if (current()) dispatch({ type: 'PARSE_ERROR', error: { code: 'E_READ' } });
        }
      })();
    },
    [dispatch, ids.heading, pendingFocusRef, finishParse],
  );

  const handleMapping = useCallback(
    (mapping: ColumnMapping) => {
      const file = fileRef.current;
      if (!file) return;
      const token = ++parseToken.current;
      const current = () => token === parseToken.current;
      dispatch({ type: 'MAPPING_SUBMITTED' });

      void (async () => {
        try {
          const { result: parsed, ms } = await parseFileInWorker(file, {
            mapping,
            onProgress: (done, total) => {
              if (current()) dispatch({ type: 'PARSE_PROGRESS', done, total });
            },
          });
          if (!current()) return;
          if (parsed.ok) {
            // Zapamiętujemy wyłącznie nagłówki i nazwy pól — nigdy wartości komórek.
            saveColumnMapping(mapping);
            finishParse(parsed, ms);
          } else if (parsed.error.code === 'E_MISSING_COLUMNS') {
            const field = parsed.error.missing[0] ?? 'publishedAt';
            const header = Object.keys(mapping).find((h) => mapping[h] === field) ?? '';
            pendingFocusRef.current = ids.mapping(field);
            dispatch({ type: 'MAPPING_FAILED', field, header });
            track('csv_error', { code: 'E_MISSING_COLUMNS' });
          } else {
            finishParse(parsed, ms);
          }
        } catch {
          if (current()) dispatch({ type: 'PARSE_ERROR', error: { code: 'E_READ' } });
        }
      })();
    },
    [dispatch, ids, pendingFocusRef, finishParse],
  );

  /** Porzucenie bieżącego parsowania (np. powrót do zapisanego raportu): jego wynik zostanie pominięty. */
  const cancelParse = useCallback(() => {
    parseToken.current++;
    fileRef.current = null;
  }, []);

  return { handleFile, handleMapping, cancelParse };
}

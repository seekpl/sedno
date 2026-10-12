'use client';

import { useCallback, useEffect, useId, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { useToast } from '@/components/ui/Toast';
import { track } from '@/lib/analytics/client';
import type { EventProps } from '@/lib/analytics/events';
import { parseFileInWorker } from '@/lib/csv/client';
import { loadColumnMapping, saveColumnMapping } from '@/lib/csv/mapping-storage';
import type { ColumnMapping, ParseResult, RequiredField } from '@/lib/csv/types';
import { tool } from '@/lib/copy/tool';
import { addMonths, monthForms, type MonthKey } from '@/lib/i18n/pl';
import { downloadReportPdf } from '@/lib/pdf/download';
import { computeReport, stripEmoji } from '@/lib/report/compute';
import { loadAuthorName, saveAuthorName } from './author-storage';
import { EffectsStep } from './EffectsStep';
import { MappingStep, REQUIRED_FIELDS } from './MappingStep';
import { useIsPhone, useIsWide } from './media';
import { NoRowsStep } from './NoRowsStep';
import type { FlowIds } from './parts';
import { PreviewStep } from './PreviewStep';
import { effectsFor, initialToolState, manualViewsFor, toolReducer } from './state';
import { ToolBar } from './ToolBar';
import { FILE_ACCEPT, UploadStep } from './UploadStep';
import s from './tool.module.css';

type LandingCta = EventProps<'landing_cta_click'>['cta'];

/** Źródła wejścia z przycisków strony głównej (?src=…), jak w schemacie zdarzenia landing_cta_click. */
const LANDING_CTAS = [
  'header',
  'hero',
  'pricing',
  'cta-band',
  'example',
  'menu',
] as const satisfies readonly LandingCta[];
// Kontrola kompletności: każda wartość ze schematu zdarzenia jest na liście.
const allCtasListed: [Exclude<LandingCta, (typeof LANDING_CTAS)[number]>] extends [never] ? true : false =
  true;
void allCtasListed;

function isLandingCta(value: string): value is LandingCta {
  return (LANDING_CTAS as readonly string[]).includes(value);
}

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
function rememberedSelection(headers: readonly string[]): Partial<Record<RequiredField, string>> {
  const mapping = rememberedMapping(headers) ?? {};
  const selection: Partial<Record<RequiredField, string>> = {};
  for (const [header, field] of Object.entries(mapping)) {
    if ((field === 'publishedAt' || field === 'views') && !selection[field]) selection[field] = header;
  }
  return selection;
}

type NewReportFlowProps = {
  /** Domyślny miesiąc: ostatni pełny (PROMPT.md §10). */
  initialMonth: MonthKey;
  /** Najpóźniejszy miesiąc w przełączniku: bieżący. */
  maxMonth: MonthKey;
};

/**
 * Narzędzie bez konta /nowy: 1. Wgraj → 2. Efekty → 3. Podgląd i PDF. Wszystko dzieje się w przeglądarce:
 * plik czyta Web Worker, wiersze żyją tylko w stanie React w pamięci karty, PDF powstaje lokalnie.
 * Na serwer trafiają wyłącznie zdarzenia analityczne z liczbami (PROMPT.md §16), nigdy treść pliku.
 */
export function NewReportFlow({ initialMonth, maxMonth }: NewReportFlowProps) {
  const [state, dispatch] = useReducer(toolReducer, initialMonth, initialToolState);
  const isPhone = useIsPhone();
  const isWide = useIsWide();
  const toast = useToast();
  const uid = useId();
  const ids = useMemo<FlowIds>(
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

  /** Wybrany plik — tylko w pamięci, do ponownego parsowania z mapowaniem kolumn. */
  const fileRef = useRef<File | null>(null);
  /** Numer bieżącego parsowania: wynik starszego (np. po wybraniu kolejnego pliku) jest pomijany. */
  const parseToken = useRef(0);
  const pickerRef = useRef<HTMLInputElement>(null);
  /** Element, na który przenieść fokus po najbliższym renderze (id). */
  const pendingFocus = useRef<string | null>(null);
  /** Zmiana miesiąca z paska: fokus zostaje na przełączniku, nawet gdy zmienia się widok. */
  const fromMonthSwitch = useRef(false);

  /** Nazwa klienta tak, jak trafi do raportu (bez emoji). Pusta = PDF niedostępny. */
  const clientName = stripEmoji(state.clientName).trim();

  // Raport liczony od nowa przy każdej zmianie — z wierszy w pamięci, bez ponownego czytania pliku.
  const result = useMemo(() => {
    if (!state.parsed) return null;
    const previousMonth = addMonths(state.month, -1);
    return computeReport({
      parsed: state.parsed,
      month: state.month,
      now: new Date(),
      client: { name: clientName || tool.effects.onReport.client.previewPlaceholder },
      author: { name: state.authorName },
      branding: 'sedno-footer',
      actions: effectsFor(state.effects, state.month),
      manualPrevious: {
        actions: effectsFor(state.effects, previousMonth),
        views: manualViewsFor(state.manualViews, previousMonth),
      },
      history: null,
      keyMetric: state.keyMetric ?? undefined,
      headline: state.headline ?? undefined,
      commentWorked: state.commentWorked,
      commentMark: state.commentMark ?? undefined,
      planNext: state.planNext,
      incompleteNote: state.incompleteNote,
    });
  }, [
    state.parsed,
    state.month,
    clientName,
    state.authorName,
    state.effects,
    state.manualViews,
    state.keyMetric,
    state.headline,
    state.commentWorked,
    state.commentMark,
    state.planNext,
    state.incompleteNote,
  ]);

  // Widok: krok z reduktora, a gdy w wybranym miesiącu nie ma publikacji — ekran naprawy (E_NO_ROWS_IN_MONTH).
  let view: 'upload' | 'mapping' | 'no-rows' | 'effects' | 'preview';
  if (state.step === 'mapping') view = 'mapping';
  else if (state.step === 'upload' || !result) view = 'upload';
  else view = result.ok ? state.step : 'no-rows';
  const uploadVisible = view === 'upload' && state.parse.status !== 'parsing';

  // Fokus na h1 po każdej zmianie widoku (WCAG 2.4.3), chyba że zmianę wywołał przełącznik miesiąca
  // albo działanie wskazało inny element (np. pole nazwy klienta).
  const lastView = useRef(view);
  useEffect(() => {
    if (view !== lastView.current) {
      lastView.current = view;
      if (!fromMonthSwitch.current) pendingFocus.current ??= ids.heading;
    }
    fromMonthSwitch.current = false;
    // Cel czeka, aż pojawi się w DOM (np. efekt poprzedniego renderu może przyjść przed nowym widokiem).
    const target = pendingFocus.current && document.getElementById(pendingFocus.current);
    if (target) {
      pendingFocus.current = null;
      target.focus();
    }
  });

  // Nazwa autora zapamiętana w tej przeglądarce.
  useEffect(() => {
    const name = loadAuthorName();
    if (name) dispatch({ type: 'SET_AUTHOR', name });
  }, []);

  // Wejście z przycisku strony głównej (?src=hero): zdarzenie bez treści, potem adres bez parametru.
  const ctaHandled = useRef(false);
  useEffect(() => {
    if (ctaHandled.current) return;
    ctaHandled.current = true;
    const url = new URL(window.location.href);
    const src = url.searchParams.get('src');
    if (src === null) return;
    if (isLandingCta(src)) track('landing_cta_click', { cta: src });
    url.searchParams.delete('src');
    const clean = `${url.pathname}${url.search}${url.hash}`;
    // Router Next.js podpina się pod history.replaceState w efekcie swojego komponentu, a ten przy pierwszym
    // renderze działa dopiero po efektach strony. Natywne replaceState przed nim skasowałoby jego stan wpisu
    // historii (powrót „Wstecz” na /nowy nie odświeżyłby widoku) i zostawiło routerowi stary adres.
    // Dlatego adres zmieniamy w kolejnym zadaniu — przez obsługę historii routera.
    window.setTimeout(() => {
      const now = new URL(window.location.href);
      if (now.pathname !== url.pathname || now.searchParams.get('src') !== src) return;
      window.history.replaceState(null, '', clean);
    }, 0);
  }, []);

  // E_NO_ROWS_IN_MONTH zaraz po wczytaniu pliku (raz na plik, nie przy każdej zmianie miesiąca).
  const checkedLoad = useRef(0);
  useEffect(() => {
    if (state.loadId === 0 || checkedLoad.current === state.loadId || !result) return;
    checkedLoad.current = state.loadId;
    if (!result.ok) track('csv_error', { code: 'E_NO_ROWS_IN_MONTH' });
  }, [state.loadId, result]);

  // report_previewed: raz na wczytany plik, gdy raport pierwszy raz jest widoczny (podgląd na żywo albo krok 3).
  const previewedLoad = useRef(0);
  const reportVisible =
    result !== null && result.ok && (view === 'preview' || (view === 'effects' && isWide));
  useEffect(() => {
    if (!reportVisible || previewedLoad.current === state.loadId) return;
    previewedLoad.current = state.loadId;
    track('report_previewed', { mode: 'anon' });
  }, [reportVisible, state.loadId]);

  /** Wynik parsowania: tylko liczby do analityki (wiersze, miesiące, czas), nigdy treść. */
  const finishParse = useCallback((parsed: ParseResult, ms: number) => {
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
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      fileRef.current = file;
      const token = ++parseToken.current;
      const current = () => token === parseToken.current;
      const onProgress = (done: number, total: number) => {
        if (current()) dispatch({ type: 'PARSE_PROGRESS', done, total });
      };
      pendingFocus.current = ids.heading;
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
    [ids.heading, finishParse],
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
            pendingFocus.current = ids.mapping(field);
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
    [ids, finishParse],
  );

  const openPicker = useCallback(() => pickerRef.current?.click(), []);

  const changeMonthFromBar = (month: MonthKey) => {
    fromMonthSwitch.current = true;
    dispatch({ type: 'SET_MONTH', month });
  };

  const setAuthorName = (name: string) => {
    dispatch({ type: 'SET_AUTHOR', name });
    saveAuthorName(name);
  };

  const requestClientName = () => {
    pendingFocus.current = ids.client;
    dispatch({ type: 'REQUEST_CLIENT_NAME' });
  };

  const downloadPdf = async () => {
    if (!result?.ok || state.pdf.status === 'busy') return;
    if (clientName === '') {
      requestClientName();
      return;
    }
    const report = result.report;
    dispatch({ type: 'PDF_START' });
    try {
      await downloadReportPdf(report);
      dispatch({ type: 'PDF_SUCCESS', client: report.client.name });
      toast({ message: tool.preview.downloaded });
      track('pdf_downloaded', { mode: 'anon', branding: 'sedno-footer' });
    } catch {
      dispatch({ type: 'PDF_ERROR' });
    }
  };

  let content: ReactNode;
  if (view === 'mapping' && state.mapping) {
    content = (
      <MappingStep
        ids={ids}
        file={state.file}
        mapping={state.mapping}
        initial={rememberedSelection(state.mapping.headers)}
        busy={state.parse.status === 'parsing'}
        isPhone={isPhone}
        onSubmit={handleMapping}
        onPickFile={openPicker}
      />
    );
  } else if (view === 'no-rows' && result && !result.ok) {
    content = (
      <NoRowsStep
        headingId={ids.heading}
        month={state.month}
        maxMonth={maxMonth}
        file={state.file}
        months={result.error.months}
        range={result.error.range}
        isPhone={isPhone}
        onMonth={(month) => dispatch({ type: 'SET_MONTH', month })}
        onPickFile={openPicker}
      />
    );
  } else if (view === 'effects' && result?.ok && state.parsed) {
    content = (
      <EffectsStep
        ids={ids}
        state={state}
        clientName={clientName}
        result={result}
        warnings={[...state.parsed.warnings, ...result.warnings]}
        isPhone={isPhone}
        isWide={isWide}
        dispatch={dispatch}
        onAuthorName={setAuthorName}
        onPickFile={openPicker}
        onKeepNote={() => {
          pendingFocus.current = ids.note;
          dispatch({ type: 'KEEP_NOTE' });
        }}
        onRestoreHeadline={() => {
          pendingFocus.current = ids.headline;
          dispatch({ type: 'RESTORE_HEADLINE' });
        }}
        onClearMark={() => {
          pendingFocus.current = ids.markButton;
          dispatch({ type: 'CLEAR_MARK' });
        }}
      />
    );
  } else if (view === 'preview' && result?.ok) {
    content = (
      <PreviewStep
        headingId={ids.heading}
        report={result.report}
        clientName={clientName}
        pdf={state.pdf}
        isPhone={isPhone}
        onDownload={() => void downloadPdf()}
        onRequestClient={requestClientName}
        onBack={() => dispatch({ type: 'GO_TO', step: 'effects' })}
      />
    );
  } else {
    content = (
      <UploadStep
        headingId={ids.heading}
        monthNom={monthForms(state.month).nom}
        file={state.file}
        parse={state.parse}
        isPhone={isPhone}
        onFile={handleFile}
        onOpenMapping={() => dispatch({ type: 'OPEN_MAPPING' })}
      />
    );
  }

  return (
    <>
      <ToolBar month={state.month} maxMonth={maxMonth} onMonthChange={changeMonthFromBar} />
      <main id="tresc" className={s.main}>
        {content}
        {/* Jeden ukryty wybór pliku poza krokiem 1 („Wgraj inny plik”, „Wgraj pełny plik”, „Wybierz inny plik”).
            W kroku 1 ma go komponent Upload. Plik trafia tylko do handleFile — nigdzie dalej. */}
        {!uploadVisible && (
          <input
            ref={pickerRef}
            type="file"
            accept={FILE_ACCEPT}
            className="sd-visually-hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) handleFile(file);
            }}
          />
        )}
      </main>
    </>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { useToast } from '@/components/ui/Toast';
import { track } from '@/lib/analytics/client';
import type { EventProps } from '@/lib/analytics/events';
import { tool } from '@/lib/copy/tool';
import { addMonths, monthForms, type MonthKey } from '@/lib/i18n/pl';
import { downloadReportPdf } from '@/lib/pdf/download';
import { computeReport, stripEmoji } from '@/lib/report/compute';
import { loadAuthorName, saveAuthorName } from './author-storage';
import { EffectsStep } from './EffectsStep';
import { MappingStep } from './MappingStep';
import { useIsPhone, useIsWide } from './media';
import { NoRowsStep } from './NoRowsStep';
import { PreviewStep } from './PreviewStep';
import { effectsFor, initialToolState, manualViewsFor, toolReducer } from './state';
import { ToolBar } from './ToolBar';
import { HiddenFilePicker, UploadStep } from './UploadStep';
import { rememberedSelection, useExportParser, useFlowIds, useViewFocus } from './use-flow';
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
  const ids = useFlowIds();
  const pickerRef = useRef<HTMLInputElement>(null);

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
  else view = result.ok ? (state.step === 'preview' ? 'preview' : 'effects') : 'no-rows';
  const uploadVisible = view === 'upload' && state.parse.status !== 'parsing';

  // Fokus na h1 po każdej zmianie widoku (WCAG 2.4.3), chyba że zmianę wywołał przełącznik miesiąca
  // albo działanie wskazało inny element (np. pole nazwy klienta).
  const { pendingFocusRef, keepFocusRef } = useViewFocus(view, ids.heading);
  const { handleFile, handleMapping } = useExportParser({ dispatch, ids, pendingFocusRef });

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

  const openPicker = useCallback(() => pickerRef.current?.click(), []);

  const changeMonthFromBar = (month: MonthKey) => {
    keepFocusRef.current = true;
    dispatch({ type: 'SET_MONTH', month });
  };

  const setAuthorName = (name: string) => {
    dispatch({ type: 'SET_AUTHOR', name });
    saveAuthorName(name);
  };

  const requestClientName = () => {
    pendingFocusRef.current = ids.client;
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
          pendingFocusRef.current = ids.note;
          dispatch({ type: 'KEEP_NOTE' });
        }}
        onRestoreHeadline={() => {
          pendingFocusRef.current = ids.headline;
          dispatch({ type: 'RESTORE_HEADLINE' });
        }}
        onClearMark={() => {
          pendingFocusRef.current = ids.markButton;
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
        {!uploadVisible && <HiddenFilePicker ref={pickerRef} onFile={handleFile} />}
      </main>
    </>
  );
}

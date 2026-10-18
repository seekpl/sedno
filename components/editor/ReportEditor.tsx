'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { EffectsStep } from '@/components/tool/EffectsStep';
import { MappingStep } from '@/components/tool/MappingStep';
import { useIsPhone, useIsWide } from '@/components/tool/media';
import { NoRowsStep } from '@/components/tool/NoRowsStep';
import { buttonSizes } from '@/components/tool/parts';
import {
  editsFromState,
  effectsFor,
  initialEditorState,
  manualViewsFor,
  toolReducer,
} from '@/components/tool/state';
import { HiddenFilePicker, UploadStep } from '@/components/tool/UploadStep';
import { rememberedSelection, useExportParser, useFlowIds, useViewFocus } from '@/components/tool/use-flow';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { track } from '@/lib/analytics/client';
import { editor } from '@/lib/copy/editor';
import { cx } from '@/lib/cx';
import { addMonths, formatDateRange, monthForms, type MonthKey } from '@/lib/i18n/pl';
import {
  computeReport,
  type ComputeFailure,
  type ComputeSuccess,
  type HistoryInput,
} from '@/lib/report/compute';
import { applyEdits, historyCoverage } from '@/lib/report/edits';
import { EditorHeader } from './EditorHeader';
import type { InitialStep } from './model';
import { SendStep } from './SendStep';
import {
  APP_LOGO_SRC,
  type EditorActions,
  type LinkView,
  type ReportRecord,
  type SavedSnapshot,
} from './types';
import s from './editor.module.css';

export type ReportEditorProps = {
  client: { id: string; name: string };
  month: MonthKey;
  /** Autor z profilu: nazwa marki albo imię; logo, gdy jest w Ustawieniach. */
  author: { name: string; hasLogo: boolean };
  /** Zapisany raport za ten miesiąc albo null. */
  saved: SavedSnapshot | null;
  /** Zapisany raport tego klienta za M−1 — tylko liczby do porównań. */
  history: HistoryInput | null;
  /** Aktywny link do zapisanego raportu. */
  link: LinkView | null;
  initialStep: InitialStep;
  actions: EditorActions;
};

/**
 * Edytor raportu z kontem /app/klienci/{id}/{YYYY-MM} (PROMPT.md §10, EkranUzupelnij.html): 1. Eksport →
 * 2. Efekty i komentarz (podgląd na żywo od 1024 px) → 3. Wyślij. Te same kroki i reduktor co /nowy
 * (components/tool), z kontem: klient i autor z bazy, zapis szkicu, historia M−1, link, PDF z logo i wysłanie.
 *
 * Plik CSV czyta Web Worker i nie opuszcza karty. Na serwer trafia wyłącznie ReportData (liczby z podsumowania,
 * efekty, komentarz) przy „Zapisz szkic” i „Przejdź do wysyłki”. Zapisany raport nie ma wierszy pliku, więc
 * bez pliku edytor nakłada pola na zapis (lib/report/edits.ts), a nowy plik liczy wszystko od nowa.
 */
export function ReportEditor({
  client,
  month,
  author,
  saved,
  history,
  link: initialLink,
  initialStep,
  actions,
}: ReportEditorProps) {
  const [state, dispatch] = useReducer(toolReducer, null, () =>
    initialEditorState({ month, base: saved?.data ?? null, step: initialStep }),
  );
  const [record, setRecord] = useState<ReportRecord | null>(
    saved ? { status: saved.status, sentAt: saved.sentAt } : null,
  );
  const [link, setLink] = useState<LinkView | null>(initialLink);
  const [linkRevoked, setLinkRevoked] = useState(false);
  const [saving, setSaving] = useState<null | 'draft' | 'ready'>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isPhone = useIsPhone();
  const isWide = useIsWide();
  const toast = useToast();
  const ids = useFlowIds();
  const pickerRef = useRef<HTMLInputElement>(null);
  const sizes = buttonSizes(isPhone);
  const logoSrc = author.hasLogo ? APP_LOGO_SRC : undefined;
  const reportRef = useMemo(() => ({ clientId: client.id, month }), [client.id, month]);
  const previousMonth = addMonths(month, -1);

  // Raport liczony od nowa przy każdej zmianie: z wierszy pliku w pamięci albo z zapisu i pól edytora.
  const result = useMemo<ComputeSuccess | ComputeFailure | null>(() => {
    const common = {
      client: { name: client.name },
      author: { name: author.name },
      branding: 'sedno-footer' as const,
    };
    if (state.parsed) {
      return computeReport({
        parsed: state.parsed,
        month,
        now: new Date(),
        ...common,
        actions: effectsFor(state.effects, month),
        manualPrevious: {
          actions: effectsFor(state.effects, previousMonth),
          views: manualViewsFor(state.manualViews, previousMonth),
        },
        history,
        keyMetric: state.keyMetric ?? undefined,
        headline: state.headline ?? undefined,
        commentWorked: state.commentWorked,
        commentMark: state.commentMark ?? undefined,
        planNext: state.planNext,
        incompleteNote: state.incompleteNote,
      });
    }
    if (state.base)
      return applyEdits(state.base, editsFromState(state), { ...common, history, now: new Date() });
    return null;
  }, [state, month, previousMonth, client.name, author.name, history]);

  // Widok: krok z reduktora; plik bez publikacji z miesiąca → ekran naprawy; krok 3 tylko z zapisem.
  let view: 'upload' | 'mapping' | 'no-rows' | 'effects' | 'send';
  if (state.step === 'mapping') view = 'mapping';
  else if (state.step === 'upload' || !result) view = 'upload';
  else if (!result.ok) view = 'no-rows';
  else view = state.step === 'send' && state.base && record ? 'send' : 'effects';
  const uploadVisible = view === 'upload' && state.parse.status !== 'parsing';

  const { pendingFocusRef } = useViewFocus(view, ids.heading);
  const { handleFile, handleMapping, cancelParse } = useExportParser({ dispatch, ids, pendingFocusRef });

  // E_NO_ROWS_IN_MONTH zaraz po wczytaniu pliku (raz na plik).
  const checkedLoad = useRef(0);
  useEffect(() => {
    if (state.loadId === 0 || checkedLoad.current === state.loadId || !result) return;
    checkedLoad.current = state.loadId;
    if (!result.ok) track('csv_error', { code: 'E_NO_ROWS_IN_MONTH' });
  }, [state.loadId, result]);

  // report_previewed: raz na wczytany raport (zapis albo plik), gdy raport pierwszy raz jest widoczny.
  const previewedLoad = useRef(-1);
  const reportVisible = result !== null && result.ok && (view === 'send' || (view === 'effects' && isWide));
  useEffect(() => {
    if (!reportVisible || previewedLoad.current === state.loadId) return;
    previewedLoad.current = state.loadId;
    track('report_previewed', { mode: 'account' });
  }, [reportVisible, state.loadId]);

  const openPicker = useCallback(() => pickerRef.current?.click(), []);

  const backToSaved = () => {
    cancelParse();
    dispatch({ type: 'DISCARD_FILE' });
  };

  const save = async (intent: 'draft' | 'ready') => {
    if (!result?.ok || saving) return;
    setSaving(intent);
    setSaveError(null);
    try {
      const response = await actions.save({ ...reportRef, data: result.report, intent });
      if (!response.ok) {
        setSaveError(response.error);
        return;
      }
      dispatch({ type: 'SAVED', data: response.report.data });
      setRecord({ status: response.report.status, sentAt: response.report.sentAt });
      if (intent === 'ready') dispatch({ type: 'GO_TO', step: 'send' });
      else if (response.report.status === 'draft') toast({ message: editor.save.saved });
      else toast({ message: editor.save.changesSaved });
    } catch {
      setSaveError(editor.errors.failed);
    } finally {
      setSaving(null);
    }
  };

  const header = (step: 1 | 2 | 3) => (
    <EditorHeader id={ids.heading} clientName={client.name} month={month} step={step} />
  );

  const identity = (
    <p className={cx('body-s', s.identity)}>
      <span>
        {author.name
          ? author.hasLogo
            ? editor.identity.authorWithLogo(author.name)
            : editor.identity.author(author.name)
          : author.hasLogo
            ? editor.identity.logoOnly
            : editor.identity.none}
      </span>{' '}
      <Link className={cx('sd-link', s.inlineLink)} href={editor.identity.settingsHref}>
        {editor.identity.settings}
      </Link>
    </p>
  );

  const backToSavedButton = state.base ? (
    <Button variant="ghost" size={sizes.small} block={isPhone} onClick={backToSaved}>
      {editor.upload.back}
    </Button>
  ) : null;

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
        header={header(1)}
      />
    );
  } else if (view === 'no-rows' && result && !result.ok) {
    content = (
      <NoRowsStep
        headingId={ids.heading}
        month={month}
        maxMonth={month}
        file={state.file}
        months={result.error.months}
        range={result.error.range}
        isPhone={isPhone}
        onPickFile={openPicker}
        header={header(1)}
        extraActions={backToSavedButton}
      />
    );
  } else if (view === 'effects' && result?.ok) {
    // Co w porównaniu z M−1 pochodzi z zapisanego raportu: kliknięcia zawsze (historia przed polami
    // ręcznymi), wyświetlenia tylko wtedy, gdy plik nie obejmuje M−1.
    const previous = result.report.previous;
    const fromHistory = {
      actions: historyCoverage(history).actions,
      summary: previous?.source === 'history' && previous.summary !== undefined,
    };
    const prevForms = monthForms(previousMonth);
    const historyNote =
      fromHistory.actions && fromHistory.summary
        ? editor.history.note(prevForms.ins, prevForms.nom)
        : fromHistory.actions
          ? editor.history.actions(prevForms.gen, prevForms.nom)
          : fromHistory.summary
            ? editor.history.views(prevForms.gen, prevForms.nom)
            : null;
    content = (
      <EffectsStep
        ids={ids}
        state={state}
        clientName={client.name}
        result={result}
        warnings={[...(state.parsed?.warnings ?? []), ...result.warnings]}
        isPhone={isPhone}
        isWide={isWide}
        dispatch={dispatch}
        onAuthorName={() => {}}
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
        header={header(2)}
        identity={identity}
        source={
          state.parsed ? undefined : (
            <Alert
              title={editor.saved.title}
              actions={
                <Button size={sizes.small} block={isPhone} onClick={() => dispatch({ type: 'OPEN_UPLOAD' })}>
                  {editor.saved.upload}
                </Button>
              }
            >
              {editor.saved.body(
                formatDateRange(new Date(result.report.dataRange.from), new Date(result.report.dataRange.to)),
              )}
            </Alert>
          )
        }
        history={historyNote ? { ...fromHistory, note: historyNote } : undefined}
        logoSrc={logoSrc}
        footer={
          <div className={s.footer}>
            {saveError && (
              <Alert variant="error" title={editor.save.error}>
                {saveError}
              </Alert>
            )}
            {link && <p className={cx('body-s', s.muted)}>{editor.save.linkNote}</p>}
            <div className={s.footerButtons}>
              <Button
                size={isWide ? 'm' : 'l'}
                block={!isWide}
                busy={saving === 'draft'}
                onClick={() => void save('draft')}
              >
                {record && record.status !== 'draft' ? editor.save.changes : editor.save.draft}
              </Button>
              <Button
                variant="primary"
                size={isWide ? 'm' : 'l'}
                block={!isWide}
                busy={saving === 'ready'}
                onClick={() => void save('ready')}
              >
                {editor.save.toSend}
              </Button>
            </div>
          </div>
        }
      />
    );
  } else if (view === 'send' && state.base && record) {
    content = (
      <SendStep
        header={header(3)}
        reportRef={reportRef}
        clientName={client.name}
        report={state.base}
        record={record}
        link={link}
        linkRevoked={linkRevoked}
        logoSrc={logoSrc}
        isPhone={isPhone}
        actions={actions}
        pendingFocusRef={pendingFocusRef}
        onRecord={setRecord}
        onLink={(next) => {
          setLink(next);
          setLinkRevoked(next === null);
        }}
        onBack={() => dispatch({ type: 'GO_TO', step: 'effects' })}
      />
    );
  } else {
    content = (
      <UploadStep
        headingId={ids.heading}
        monthNom={monthForms(month).nom}
        file={state.file}
        parse={state.parse}
        isPhone={isPhone}
        onFile={handleFile}
        onOpenMapping={() => dispatch({ type: 'OPEN_MAPPING' })}
        header={header(1)}
        notice={
          <Alert title={editor.upload.title} actions={backToSavedButton ?? undefined}>
            {state.base ? editor.upload.bodySaved : editor.upload.body}
          </Alert>
        }
      />
    );
  }

  return (
    <>
      {content}
      {/* Jeden ukryty wybór pliku poza krokiem 1. Plik trafia tylko do handleFile — nigdzie dalej. */}
      {!uploadVisible && <HiddenFilePicker ref={pickerRef} onFile={handleFile} />}
    </>
  );
}

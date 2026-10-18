'use client';

import { useId, useState, type Dispatch, type ReactNode } from 'react';
import { PhoneFrame } from '@/components/report/PhoneFrame';
import { Report } from '@/components/report/Report';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FileChip } from '@/components/ui/FileChip';
import { NumberField } from '@/components/ui/NumberField';
import { TextField } from '@/components/ui/TextField';
import type { Warning } from '@/lib/csv/types';
import { report as reportCopy } from '@/lib/copy/report';
import { tool } from '@/lib/copy/tool';
import { cx } from '@/lib/cx';
import {
  addMonths,
  formatDate,
  formatDateRange,
  formatFileSize,
  formatNumber,
  monthForms,
  plural,
} from '@/lib/i18n/pl';
import type { ComputeSuccess } from '@/lib/report/compute';
import { ACTION_ORDER } from '@/lib/report/format';
import { AUTHOR_NAME_MAX } from './author-storage';
import { CommentCard } from './CommentCard';
import { KeyMetricChooser } from './KeyMetricChooser';
import { buttonSizes, HowToLink, StepHeader, StepList, type FlowIds } from './parts';
import { effectsFor, manualViewsFor, type ToolAction, type ToolState } from './state';
import { Warnings } from './Warnings';
import s from './tool.module.css';

const t = tool.effects;

/** Limity jak w reportDataSchema: klient 80, tytuł 160 znaków. */
export const CLIENT_NAME_MAX = 80;
export const HEADLINE_MAX = 160;

type EffectsStepProps = {
  ids: FlowIds;
  state: ToolState;
  /** Nazwa klienta tak, jak trafi do raportu (przycięta, bez emoji). */
  clientName: string;
  result: ComputeSuccess;
  /** Ostrzeżenia parsera (np. kodowanie) i obliczeń. */
  warnings: readonly Warning[];
  isPhone: boolean;
  /** Od 1024 px: układ EkranUzupelnij.html z podglądem raportu na żywo. */
  isWide: boolean;
  dispatch: Dispatch<ToolAction>;
  onAuthorName: (name: string) => void;
  onPickFile: () => void;
  onKeepNote: () => void;
  onRestoreHeadline: () => void;
  onClearMark: () => void;
  /** Nagłówek zamiast wbudowanego (edytor z kontem: link „Klienci”, h1 z klientem i miesiącem, lista kroków). */
  header?: ReactNode;
  /** Zamiast karty „Na raporcie” z polami autora i klienta (edytor z kontem: autor i klient z konta). */
  identity?: ReactNode;
  /** Zamiast chipa pliku i komunikatu „Wczytano …” (edytor z kontem bez pliku: liczby z zapisanego raportu). */
  source?: ReactNode;
  /**
   * Zapisany raport za M−1 (edytor z kontem). Pola ręczne, których porównanie i tak pochodzi z historii,
   * są ukryte; `note` mówi, skąd są liczby „{M−1}: …”.
   */
  history?: { actions: boolean; summary: boolean; note: string };
  /** Zamiast „Zobacz raport” / „Przejdź do PDF” (edytor z kontem: „Zapisz szkic”, „Przejdź do wysyłki”). */
  footer?: ReactNode;
  /** Logo autora w podglądzie na żywo (/app/logo). */
  logoSrc?: string;
};

/**
 * Krok 2 — Efekty (EkranWgrywanie.html na telefonie, EkranUzupelnij.html od 1024 px): trzy liczby z panelu
 * profesjonalnego, kluczowa liczba, tytuł, komentarz z zakreślaczem i ostrzeżenia o danych.
 */
export function EffectsStep({
  ids,
  state,
  clientName,
  result,
  warnings,
  isPhone,
  isWide,
  dispatch,
  onAuthorName,
  onPickFile,
  onKeepNote,
  onRestoreHeadline,
  onClearMark,
  header,
  identity,
  source,
  history,
  footer,
  logoSrc,
}: EffectsStepProps) {
  const id = useId();
  const sizes = buttonSizes(isPhone);
  const report = result.report;
  const month = state.month;
  const forms = monthForms(month);
  const previousMonth = addMonths(month, -1);
  const previous = monthForms(previousMonth);
  const next = monthForms(addMonths(month, 1));
  const posts = report.summary.posts;
  const actions = effectsFor(state.effects, month);
  const previousActions = effectsFor(state.effects, previousMonth);
  const clientError = state.clientNameRequested && clientName === '' ? t.onReport.client.required : undefined;
  const headlineValue = state.headline ?? result.generatedHeadline;
  const headlineEdited = state.headline !== null && state.headline !== result.generatedHeadline;
  const coverage = result.previousFileCoverage;
  const [previousOpen, setPreviousOpen] = useState(coverage === 'partial');
  // Po zmianie miesiąca plik może zaczynać się w połowie nowego M−1: sekcja z polami otwiera się wtedy sama,
  // bo informacja nad nią każe wpisać liczby „niżej”.
  const [lastCoverage, setLastCoverage] = useState(coverage);
  if (coverage !== lastCoverage) {
    setLastCoverage(coverage);
    if (coverage === 'partial') setPreviousOpen(true);
  }

  // Pola ręczne M−1 tylko tam, gdzie wpisana liczba trafi do porównania (plik i historia mają pierwszeństwo).
  const showPreviousActions = !history?.actions;
  const showPreviousViews = coverage !== 'full' && !history?.summary;

  const previousHint = (value: number | null | undefined) =>
    value == null ? undefined : reportCopy.previousValue(previous.nom, formatNumber(value));

  return (
    <div className={s.effects}>
      <div className={s.form}>
        {header ??
          (isWide ? (
            <header className={s.wideHeader}>
              <h1 id={ids.heading} tabIndex={-1} className={cx('heading-2', s.title)}>
                {t.headingWide(clientName || t.newClient, forms.nom)}
              </h1>
              <StepList current={2} />
            </header>
          ) : (
            <StepHeader id={ids.heading} caption={tool.stepCaption(2)} title={t.heading} />
          ))}

        {source ?? (
          <>
            {state.file && (
              <div className={s.fileRow}>
                <FileChip name={state.file.name} size={formatFileSize(state.file.size)} />
                <Button variant="ghost" size={sizes.main} onClick={onPickFile}>
                  {t.changeFile}
                </Button>
              </div>
            )}

            <Alert
              variant="success"
              role="status"
              title={t.loaded.title(formatNumber(posts), plural(posts, t.loaded.posts), forms.gen)}
            >
              {t.loaded.body(formatDateRange(new Date(report.dataRange.from), new Date(report.dataRange.to)))}
            </Alert>
          </>
        )}

        {identity ?? (
          <section className={cx('sd-card', s.card)} aria-labelledby={`${id}-on-report`}>
            <h2 id={`${id}-on-report`} className="heading-3">
              {t.onReport.title}
            </h2>
            <div className={s.fields}>
              <TextField
                label={t.onReport.author.label}
                hint={t.onReport.author.hint}
                value={state.authorName}
                maxLength={AUTHOR_NAME_MAX}
                autoComplete="organization"
                wide
                onChange={(e) => onAuthorName(e.target.value)}
              />
              <TextField
                id={ids.client}
                label={t.onReport.client.label}
                hint={t.onReport.client.hint}
                error={clientError}
                value={state.clientName}
                placeholder={t.onReport.client.placeholder}
                maxLength={CLIENT_NAME_MAX}
                autoComplete="off"
                wide
                onChange={(e) => dispatch({ type: 'SET_CLIENT', name: e.target.value })}
              />
            </div>
          </section>
        )}

        <section className={cx('sd-card', s.card)} aria-labelledby={`${id}-actions`}>
          <div className={s.cardHead}>
            <h2 id={`${id}-actions`} className="heading-3">
              {t.actions.title}
            </h2>
            <p className={cx('body-s', s.cardLead)}>{t.actions.hint(forms.nom)}</p>
            <HowToLink href={t.actions.howToHref}>{t.actions.howTo}</HowToLink>
          </div>

          <div className={s.numbers}>
            {/* Klucz z miesiącem: po zmianie miesiąca pole pokazuje liczbę tego miesiąca, bez starego wpisu. */}
            {ACTION_ORDER.map((key) => (
              <NumberField
                key={`${month}-${key}`}
                label={reportCopy.actionLabel(key)}
                value={actions[key]}
                hint={previousHint(report.previous?.actions?.[key])}
                invalidMessage={t.actions.invalid}
                fullWidth
                wide
                onChange={(value) => dispatch({ type: 'SET_ACTION', key, value })}
              />
            ))}
          </div>

          {history && <p className={cx('body-s', s.cardLead)}>{history.note}</p>}

          {coverage === 'partial' && result.previousFilePartialFrom && !history?.summary && (
            <Alert
              variant="info"
              title={t.previous.partial.title(formatDate(new Date(result.previousFilePartialFrom)))}
            >
              {t.previous.partial.body(previous.nom, previous.gen)}
            </Alert>
          )}

          {(showPreviousActions || showPreviousViews) && (
            <details
              className={s.details}
              open={previousOpen}
              onToggle={(e) => setPreviousOpen(e.currentTarget.open)}
            >
              <summary className={s.summary}>{t.previous.summary(previous.gen)}</summary>
              <div className={s.detailsBody}>
                <p className={cx('body-s', s.cardLead)}>{t.previous.lead}</p>
                {showPreviousActions && (
                  <div className={s.numbers}>
                    {ACTION_ORDER.map((key) => (
                      <NumberField
                        key={`${previousMonth}-${key}`}
                        label={t.previous.actionLabel(reportCopy.actionLabel(key), previous.loc)}
                        value={previousActions[key]}
                        invalidMessage={t.actions.invalid}
                        fullWidth
                        wide
                        onChange={(value) => dispatch({ type: 'SET_PREVIOUS_ACTION', key, value })}
                      />
                    ))}
                  </div>
                )}
                {showPreviousViews && (
                  <NumberField
                    key={`${previousMonth}-views`}
                    label={t.previous.viewsLabel(previous.loc)}
                    hint={t.previous.viewsHint(previous.nom)}
                    value={manualViewsFor(state.manualViews, previousMonth)}
                    invalidMessage={t.actions.invalid}
                    fullWidth
                    wide
                    onChange={(value) => dispatch({ type: 'SET_PREVIOUS_VIEWS', value })}
                  />
                )}
              </div>
            </details>
          )}

          <KeyMetricChooser
            report={report}
            fallback={result.keyMetricFallback}
            onChange={(key) => dispatch({ type: 'SET_KEY_METRIC', key })}
          />

          <div className={s.fields}>
            <TextField
              id={ids.headline}
              label={t.headline.label}
              hint={t.headline.hint}
              value={headlineValue}
              maxLength={HEADLINE_MAX}
              wide
              onChange={(e) => dispatch({ type: 'SET_HEADLINE', value: e.target.value })}
              onBlur={(e) => {
                // Puste pole wraca do tytułu z liczb — raport zawsze ma tytuł. Bez przenoszenia fokusu:
                // użytkownik właśnie przechodzi do innego pola (onRestoreHeadline wróciłby fokusem tutaj).
                if (e.target.value.trim() === '') dispatch({ type: 'RESTORE_HEADLINE' });
              }}
            />
            {headlineEdited && (
              <div className={s.inline}>
                <Button variant="ghost" size={sizes.small} onClick={onRestoreHeadline}>
                  {t.headline.restore}
                </Button>
              </div>
            )}
          </div>
        </section>

        <CommentCard
          ids={ids}
          worked={state.commentWorked}
          plan={state.planNext}
          mark={state.commentMark}
          suggestion={result.postsSuggestion}
          nextMonthNom={next.nom}
          isPhone={isPhone}
          onWorked={(value) => dispatch({ type: 'SET_COMMENT_WORKED', value })}
          onPlan={(value) => dispatch({ type: 'SET_PLAN', value })}
          onMark={(text) => dispatch({ type: 'SET_MARK', text })}
          onClearMark={onClearMark}
        />

        <Warnings
          warnings={warnings}
          month={month}
          noteId={ids.note}
          incompleteCollapsed={state.incompleteCollapsed}
          isPhone={isPhone}
          onUploadFull={onPickFile}
          onKeepNote={onKeepNote}
        />

        {footer ?? (
          <div className={s.footer}>
            <Button
              variant="primary"
              size={isWide ? 'm' : 'l'}
              block={!isWide}
              onClick={() => dispatch({ type: 'GO_TO', step: 'preview' })}
            >
              {isWide ? t.toPdf : t.toPreview}
            </Button>
          </div>
        )}
      </div>

      {isWide && (
        <aside className={s.live} aria-labelledby={`${id}-live`}>
          <p id={`${id}-live`} className="label">
            {tool.preview.liveLabel}
          </p>
          <PhoneFrame scale={0.9} label={tool.preview.frameLabel}>
            <Report data={report} headingLevel={2} logoSrc={logoSrc} />
          </PhoneFrame>
        </aside>
      )}
    </div>
  );
}

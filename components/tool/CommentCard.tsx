'use client';

import { useId, useState, type SyntheticEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { report as reportCopy } from '@/lib/copy/report';
import { tool } from '@/lib/copy/tool';
import { cx } from '@/lib/cx';
import { buttonSizes, type FlowIds } from './parts';
import { MARK_MAX } from './state';
import s from './tool.module.css';

const t = tool.effects.comment;

/** Limity tekstów jak w reportDataSchema (lib/report/types.ts). */
export const COMMENT_MAX = 1200;

/** Zaznaczony fragment pola tekstowego, przycięty. Zaznaczenie zostaje w polu także po utracie fokusu. */
function selectedText(element: HTMLTextAreaElement | null): string {
  if (!element) return '';
  return element.value.slice(element.selectionStart, element.selectionEnd).trim();
}

type CommentCardProps = {
  ids: FlowIds;
  worked: string;
  plan: string;
  mark: string | null;
  /** Podpowiedź z liczby publikacji wg typu: „8 rolek, 9 postów, 14 relacji”. */
  suggestion: string;
  /** „październik” — miesiąc po raportowanym. */
  nextMonthNom: string;
  isPhone: boolean;
  onWorked: (value: string) => void;
  onPlan: (value: string) => void;
  onMark: (text: string) => void;
  onClearMark: () => void;
};

/**
 * Komentarz dla klienta: „Co zadziałało” z zakreślaczem jednego fragmentu i „Plan na {miesiąc}”.
 * Zakreślacz: zaznacz fragment w polu, potem „Zakreśl zaznaczony fragment”. Jedno zakreślenie na raport.
 */
export function CommentCard({
  ids,
  worked,
  plan,
  mark,
  suggestion,
  nextMonthNom,
  isPhone,
  onWorked,
  onPlan,
  onMark,
  onClearMark,
}: CommentCardProps) {
  const id = useId();
  const sizes = buttonSizes(isPhone);
  const [selection, setSelection] = useState('');
  const hintId = `${id}-mark-hint`;
  const reasonId = `${id}-mark-reason`;
  const tooLong = selection.length > MARK_MAX;
  const unavailable = selection === '' || tooLong;

  const trackSelection = (event: SyntheticEvent<HTMLTextAreaElement>) =>
    setSelection(selectedText(event.currentTarget));
  const workedField = () => document.getElementById(ids.worked) as HTMLTextAreaElement | null;

  return (
    <section className={cx('sd-card', s.card)} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="heading-3">
        {t.title}
      </h2>

      <div className={s.fields}>
        <TextField
          multiline
          id={ids.worked}
          label={reportCopy.sections.worked}
          value={worked}
          maxLength={COMMENT_MAX}
          placeholder={suggestion ? t.workedPlaceholder(suggestion) : undefined}
          wide
          onChange={(e) => {
            onWorked(e.target.value);
            setSelection(selectedText(e.currentTarget));
          }}
          onSelect={trackSelection}
          onKeyUp={trackSelection}
          onMouseUp={trackSelection}
          onTouchEnd={trackSelection}
        />

        <div className={s.fields}>
          <div className={s.inline}>
            <Button
              id={ids.markButton}
              size={sizes.small}
              block={isPhone}
              unavailable={unavailable}
              aria-describedby={tooLong ? `${hintId} ${reasonId}` : hintId}
              onUnavailableClick={() => workedField()?.focus()}
              onClick={() => {
                const text = selectedText(workedField());
                if (text && text.length <= MARK_MAX) onMark(text);
              }}
            >
              {t.mark.button}
            </Button>
          </div>
          <span id={hintId} className="sd-field__hint">
            {t.mark.hint}
          </span>
          {tooLong && (
            <span id={reasonId} className="sd-field__hint">
              {t.mark.tooLong(MARK_MAX)}
            </span>
          )}
          {/* Wynik zakreślenia dla czytników ekranu (WCAG 4.1.3): fokus zostaje na przycisku, a region
              istnieje stale, żeby zmiana treści była ogłoszona. */}
          <p className="sd-visually-hidden" role="status">
            {mark ? t.mark.current(mark) : ''}
          </p>
          {mark && (
            <div className={s.inline}>
              <p className={cx('body-s', s.markText)} aria-hidden="true">
                {t.mark.current(mark)}
              </p>
              <Button variant="ghost" size={sizes.small} onClick={onClearMark}>
                {t.mark.remove}
              </Button>
            </div>
          )}
        </div>

        <TextField
          multiline
          label={reportCopy.sections.plan(nextMonthNom)}
          value={plan}
          maxLength={COMMENT_MAX}
          wide
          onChange={(e) => onPlan(e.target.value)}
        />
      </div>

      <p className="sd-field__hint">{t.emoji}</p>
    </section>
  );
}

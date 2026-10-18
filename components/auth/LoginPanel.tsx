'use client';

import { useActionState, useEffect, useId, useRef } from 'react';
import { requestMagicLink, type LoginState } from '@/app/logowanie/actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { auth as t } from '@/lib/copy/auth';
import { cx } from '@/lib/cx';
import s from './LoginPanel.module.css';

const INITIAL_STATE: LoginState = { status: 'idle' };

type LoginPanelProps = {
  /** Ścieżka powrotu po zalogowaniu, już po safeNextPath (tylko /app). */
  next: string;
  /** /logowanie?blad=link: link z e-maila wygasł, był użyty albo otwarto go w innej przeglądarce. */
  linkError?: boolean;
};

/**
 * Logowanie linkiem z e-maila (PROMPT.md §10): adres → „Sprawdź skrzynkę”. Server Action przez
 * useActionState — działa też bez JavaScriptu. Etykieta nad polem, błąd przez aria-describedby. Po zmianie
 * widoku fokus idzie na nagłówek (docs/decisions.md, p. 81), po błędzie adresu — na pole.
 */
export function LoginPanel({ next, linkError }: LoginPanelProps) {
  const [state, formAction, pending] = useActionState(requestMagicLink, INITIAL_STATE);
  const id = useId();
  const emailId = `${id}-email`;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previous = useRef<LoginState>(INITIAL_STATE);

  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (before === state) return;
    if (state.status === 'sent' && before.status !== 'sent') headingRef.current?.focus();
    else if (state.status === 'idle' && (state.fieldError || before.status === 'sent')) {
      document.getElementById(emailId)?.focus();
    }
  }, [state, emailId]);

  // Supabase Auth dopisuje opis błędu (po angielsku) w części „#” adresu; przeglądarka przenosi ją przez
  // przekierowanie na /logowanie?blad=link. Usuwamy ją z paska adresu bez przeładowania.
  useEffect(() => {
    if (!linkError || !window.location.hash) return;
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, '', `${pathname}${search}`);
  }, [linkError]);

  if (state.status === 'sent') {
    return (
      <div className={s.panel}>
        <h1 ref={headingRef} tabIndex={-1} className={cx('heading-1', s.title)}>
          {t.checkInbox.title}
        </h1>
        <p className="body-l">{t.checkInbox.body(state.email)}</p>
        <p className="sd-secondary">{t.checkInbox.spam}</p>

        {state.resent && !state.message && (
          <Alert variant="success" role="status" title={t.checkInbox.resent} />
        )}
        {state.message && (
          <Alert variant="error" title={t.error.title}>
            {state.message}
          </Alert>
        )}

        <form action={formAction} className={s.actions}>
          <input type="hidden" name="email" value={state.email} />
          <input type="hidden" name="next" value={next} />
          <Button type="submit" name="intent" value="resend" busy={pending}>
            {t.checkInbox.resend}
          </Button>
          <Button type="submit" name="intent" value="change" variant="ghost">
            {t.checkInbox.change}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className={s.panel}>
      <h1 className={cx('heading-1', s.title)}>{t.form.title}</h1>
      <p className="body-l sd-secondary">{t.form.lead}</p>

      {linkError && !state.message && !state.fieldError && (
        <Alert variant="error" title={t.linkError.title}>
          {t.linkError.body}
        </Alert>
      )}

      <form action={formAction} className={s.form} aria-label={t.form.label} noValidate>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="intent" value="send" />
        <TextField
          id={emailId}
          label={t.form.email.label}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state.email}
          error={state.fieldError}
        />

        {state.message && (
          <Alert variant="error" title={t.error.title}>
            {state.message}
          </Alert>
        )}

        <Button type="submit" variant="primary" busy={pending} className={s.submit}>
          {t.form.submit}
        </Button>
      </form>

      <p className={cx('body-s', 'sd-secondary', s.legal)}>
        {t.form.legal.before}
        <a className="sd-link" href="/regulamin">
          {t.form.legal.terms}
        </a>
        {t.form.legal.middle}
        <a className="sd-link" href="/prywatnosc">
          {t.form.legal.privacy}
        </a>
        {t.form.legal.after}
      </p>
    </div>
  );
}

'use client';

import { useActionState, useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { joinWaitlist, type WaitlistState } from '@/app/actions/waitlist';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { TextField } from '@/components/ui/TextField';
import { PLANS } from '@/config/pricing';
import { getAnonId } from '@/lib/analytics/client';
// Tylko teksty listy (nie całe lib/copy/pl.ts), żeby nie powiększać JavaScriptu strony głównej.
import { waitlist as t } from '@/lib/copy/waitlist';
import { cx } from '@/lib/cx';
import s from './WaitlistForm.module.css';

const INITIAL_STATE: WaitlistState = { status: 'idle' };

// Identyfikator sesji jako zewnętrzny magazyn: na serwerze pusty, w przeglądarce z sessionStorage.
const noSubscribe = () => () => {};
const serverAnonId = () => '';

type WaitlistFormProps = { plan: 'solo' | 'studio' };

/**
 * Zapis na listę oczekujących na start planu (docs/decisions.md, p. 18). Server Action przez
 * useActionState — działa też bez JavaScriptu. Etykiety nad polami, błędy przez aria-describedby,
 * po błędzie fokus wraca do pierwszego złego pola, po sukcesie na komunikat.
 */
export function WaitlistForm({ plan }: WaitlistFormProps) {
  const [state, formAction, pending] = useActionState(joinWaitlist, INITIAL_STATE);
  const anonId = useSyncExternalStore(noSubscribe, getAnonId, serverAnonId);
  const id = useId();
  const emailId = `${id}-email`;
  const consentId = `${id}-consent`;
  const consentErrorId = `${consentId}-error`;
  const resultRef = useRef<HTMLDivElement>(null);
  const planName = PLANS[plan].name;
  const emailError = state.fieldErrors?.email;
  const consentError = state.fieldErrors?.consent;

  useEffect(() => {
    if (state.status === 'success') resultRef.current?.focus();
    else if (state.fieldErrors?.email) document.getElementById(emailId)?.focus();
    else if (state.fieldErrors?.consent) document.getElementById(consentId)?.focus();
  }, [state, emailId, consentId]);

  if (state.status === 'success') {
    return (
      <div ref={resultRef} tabIndex={-1}>
        <Alert variant="success" role="status" title={t.success.title}>
          {t.success.body(planName)}
        </Alert>
      </div>
    );
  }

  return (
    <form action={formAction} className={s.form} aria-label={t.formLabel(planName)}>
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="anonId" value={anonId} />

      <TextField
        id={emailId}
        label={t.email.label}
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        defaultValue={state.email}
        error={emailError}
      />

      <div className={cx('sd-field', consentError ? 'sd-field--error' : undefined)}>
        <label className={s.consent} htmlFor={consentId}>
          <input
            id={consentId}
            className={s.checkbox}
            type="checkbox"
            name="consent"
            required
            defaultChecked={state.consent}
            aria-invalid={consentError ? true : undefined}
            aria-describedby={consentError ? consentErrorId : undefined}
          />
          <span>
            {t.consent.before(planName)}
            <a className="sd-link" href="/prywatnosc">
              {t.consent.link}
            </a>
            {t.consent.after}
          </span>
        </label>
        {consentError && (
          <span id={consentErrorId} className="sd-field__error">
            <Icon name="error" size="s" />
            {consentError}
          </span>
        )}
      </div>

      {state.status === 'error' && state.message && (
        <Alert variant="error" title={t.error.title}>
          {state.message}
        </Alert>
      )}

      <Button type="submit" variant="primary" busy={pending} className={s.submit}>
        {t.submit}
      </Button>
    </form>
  );
}

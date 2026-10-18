'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import { updateProfile, type ProfileState } from '@/app/app/ustawienia/actions';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { settings } from '@/lib/copy/settings';
import { PROFILE_NAME_MAX } from './limits';
import s from './Settings.module.css';

const t = settings.profile;
const INITIAL_STATE: ProfileState = { status: 'idle' };

/**
 * „Profil i marka”: imię i nazwa na raporcie. Server Action przez useActionState — działa też bez
 * JavaScriptu (zwykły POST). Etykiety nad polami, błędy przez aria-describedby, po błędzie fokus na pierwsze
 * złe pole. Po zapisie obok przycisku „Zapisz” pojawia się „Zapisano” (region role="status"); znika przy
 * kolejnej zmianie pola.
 */
export function ProfileForm({
  displayName,
  brandName,
}: {
  displayName: string | null;
  brandName: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateProfile, INITIAL_STATE);
  const [editedAfter, setEditedAfter] = useState<ProfileState | null>(null);
  const id = useId();
  const displayNameId = `${id}-display-name`;
  const brandNameId = `${id}-brand-name`;

  const values =
    state.status === 'error'
      ? state.values
      : state.status === 'success'
        ? { displayName: state.displayName ?? '', brandName: state.brandName ?? '' }
        : { displayName: displayName ?? '', brandName: brandName ?? '' };
  const errors = state.status === 'error' ? state.fieldErrors : undefined;
  const message = state.status === 'error' ? state.message : undefined;
  const saved = state.status === 'success' && editedAfter !== state;

  useEffect(() => {
    if (state.status !== 'error') return;
    if (state.fieldErrors?.displayName) document.getElementById(displayNameId)?.focus();
    else if (state.fieldErrors?.brandName) document.getElementById(brandNameId)?.focus();
  }, [state, displayNameId, brandNameId]);

  return (
    <form action={formAction} className={s.form} noValidate onChange={() => setEditedAfter(state)}>
      <TextField
        id={displayNameId}
        label={t.displayName.label}
        hint={t.displayName.hint}
        error={errors?.displayName}
        name="displayName"
        defaultValue={values.displayName}
        maxLength={PROFILE_NAME_MAX}
        autoComplete="name"
      />
      <TextField
        id={brandNameId}
        label={t.brandName.label}
        hint={t.brandName.hint}
        error={errors?.brandName}
        name="brandName"
        defaultValue={values.brandName}
        maxLength={PROFILE_NAME_MAX}
        autoComplete="organization"
      />
      {message && (
        <Alert variant="error" title={t.errorTitle}>
          {message}
        </Alert>
      )}
      <div className={s.formActions}>
        <Button type="submit" variant="primary" busy={pending}>
          {t.submit}
        </Button>
        <p role="status">
          {saved && (
            <Badge variant="success" icon="check">
              {t.saved}
            </Badge>
          )}
        </p>
      </div>
    </form>
  );
}

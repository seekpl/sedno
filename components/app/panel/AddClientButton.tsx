'use client';

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { createClient, type AddClientState } from '@/app/app/klienci/actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { FieldShell, fieldDescribedBy, TextField } from '@/components/ui/TextField';
import { useToast } from '@/components/ui/Toast';
import { panel } from '@/lib/copy/panel';
import { PANEL_HEADING_ID } from './model';
import s from './Panel.module.css';

const t = panel.add;
const INITIAL_STATE: AddClientState = { status: 'idle' };

/**
 * „Dodaj klienta”: przycisk i okno z formularzem (nazwa, branża). Po zapisie okno się zamyka, toast mówi
 * „Klient dodany”, a lista odświeża się z serwera (revalidatePath w akcji). Fokus wraca na przycisk;
 * gdy przycisk zniknął (pusty stan po pierwszym kliencie) — na nagłówek panelu.
 */
export function AddClientButton({
  variant = 'default',
  className,
}: {
  variant?: 'default' | 'primary';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const added = useRef(false);

  const onCreated = useCallback(() => {
    added.current = true;
    setOpen(false);
    toast({ message: panel.toast.created });
  }, [toast]);
  const onClose = useCallback(() => setOpen(false), []);

  // Pusty stan znika razem z tym przyciskiem po dodaniu pierwszego klienta, a fokus spadłby na <body>.
  useLayoutEffect(
    () => () => {
      if (!added.current) return;
      window.setTimeout(() => {
        if (document.activeElement === document.body || document.activeElement === null)
          document.getElementById(PANEL_HEADING_ID)?.focus();
      }, 0);
    },
    [],
  );

  return (
    <>
      <Button variant={variant} icon="plus" className={className} onClick={() => setOpen(true)}>
        {panel.actions.addClient}
      </Button>
      <Modal
        open={open}
        onClose={onClose}
        title={t.title}
        actions={<AddClientForm onCreated={onCreated} onCancel={onClose} />}
      >
        {t.body}
      </Modal>
    </>
  );
}

/**
 * Formularz w oknie. Montowany przy każdym otwarciu, więc zaczyna od pustego stanu. Akcję wywołujemy
 * sami w onSubmit (bez automatycznego czyszczenia formularza przez Reacta), więc po błędzie wpisana nazwa
 * i wybrana branża zostają. Błędy pod polami (aria-describedby), fokus na pierwsze złe pole.
 */
function AddClientForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [state, formAction, pending] = useActionState(createClient, INITIAL_STATE);
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState<keyof typeof panel.industries>('inne');
  const id = useId();
  const nameId = `${id}-name`;
  const industryId = `${id}-industry`;
  const errors = state.status === 'error' ? state.fieldErrors : undefined;
  const message = state.status === 'error' ? state.message : undefined;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  };

  useEffect(() => {
    if (state.status === 'success') onCreated();
    else if (state.status === 'error' && state.fieldErrors?.name) document.getElementById(nameId)?.focus();
    else if (state.status === 'error' && state.fieldErrors?.industry)
      document.getElementById(industryId)?.focus();
  }, [state, onCreated, nameId, industryId]);

  return (
    <form onSubmit={submit} className={s.addForm} noValidate>
      <TextField
        id={nameId}
        label={t.name.label}
        hint={t.name.hint}
        error={errors?.name}
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        autoComplete="off"
        required
        wide
      />
      <FieldShell id={industryId} label={t.industry.label} error={errors?.industry} wide>
        <select
          id={industryId}
          name="industry"
          className="sd-input"
          value={industry}
          onChange={(e) => setIndustry(e.target.value as keyof typeof panel.industries)}
          aria-invalid={errors?.industry ? true : undefined}
          aria-describedby={fieldDescribedBy(industryId, undefined, errors?.industry)}
        >
          {Object.entries(panel.industries).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </FieldShell>
      {message && (
        <Alert variant="error" title={t.errorTitle}>
          {message}
        </Alert>
      )}
      <div className={`sd-modal__actions ${s.addButtons}`}>
        <Button onClick={onCancel}>{t.cancel}</Button>
        <Button type="submit" variant="primary" busy={pending}>
          {t.submit}
        </Button>
      </div>
    </form>
  );
}

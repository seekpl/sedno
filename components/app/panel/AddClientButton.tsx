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

/** Fokus spadł na <body> (element, który go miał, zniknął z dokumentu) → nagłówek panelu. */
function focusHeadingIfLost() {
  const active = document.activeElement;
  if (!active || active === document.body || !active.isConnected) {
    document.getElementById(PANEL_HEADING_ID)?.focus();
  }
}

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
      if (added.current) window.setTimeout(focusHeadingIfLost, 0);
    },
    [],
  );

  return (
    <>
      <Button
        variant={variant}
        icon="plus"
        className={className}
        onClick={() => {
          added.current = false;
          setOpen(true);
        }}
      >
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
  const onCreatedRef = useRef(onCreated);
  useEffect(() => {
    onCreatedRef.current = onCreated;
  });
  // Drugie wysłanie przed ponownym renderem (dwa szybkie stuknięcia) nie wywoła akcji drugi raz.
  const inFlight = useRef(false);

  const [state, formAction, pending] = useActionState(
    async (previous: AddClientState, data: FormData): Promise<AddClientState> => {
      try {
        const result = await createClient(previous, data);
        // Od razu, nie w efekcie po renderze: odświeżona lista (revalidatePath) przychodzi w tym samym
        // zatwierdzeniu co wynik akcji i w pustym stanie odmontowuje ten formularz — toast by przepadł.
        if (result.status === 'success') onCreatedRef.current();
        return result;
      } catch {
        // Zerwane połączenie albo odpowiedź spoza akcji: komunikat w oknie zamiast strony błędu.
        return { status: 'error', message: t.errors.failed };
      } finally {
        inFlight.current = false;
      }
    },
    INITIAL_STATE,
  );
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState<keyof typeof panel.industries>('inne');
  const id = useId();
  const nameId = `${id}-name`;
  const industryId = `${id}-industry`;
  const errors = state.status === 'error' ? state.fieldErrors : undefined;
  const message = state.status === 'error' ? state.message : undefined;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || inFlight.current) return;
    inFlight.current = true;
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  };

  useEffect(() => {
    if (state.status !== 'error') return;
    if (state.fieldErrors?.name) document.getElementById(nameId)?.focus();
    else if (state.fieldErrors?.industry) document.getElementById(industryId)?.focus();
  }, [state, nameId, industryId]);

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

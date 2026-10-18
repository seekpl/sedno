'use client';

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { deleteAccount, type DeleteAccountState } from '@/app/app/ustawienia/actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { fieldDescribedBy, TextField } from '@/components/ui/TextField';
import { settings } from '@/lib/copy/settings';
import s from './Settings.module.css';

const t = settings.deleteAccount;
const INITIAL_STATE: DeleteAccountState = { status: 'idle' };

/**
 * „Usuń konto”: przycisk i okno z wyraźnym potwierdzeniem (wpisanie słowa „usuń”). Okno ma pułapkę fokusu
 * i Esc (Modal), fokus startuje w polu potwierdzenia i wraca na przycisk po zamknięciu. Ostrzeżenie z treści
 * okna opisuje pole (aria-describedby), więc czytnik przeczyta je razem z etykietą zaraz po otwarciu.
 * W trakcie usuwania okna nie da się zamknąć (Esc, tło, „Zostaw konto”) — zamknięcie sugerowałoby, że konto
 * zostaje, a serwer i tak by je usunął. Po usunięciu akcja przekierowuje na stronę główną.
 */
export function DeleteAccount({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const pending = useRef(false);
  const onClose = useCallback(() => {
    if (!pending.current) setOpen(false);
  }, []);
  const onPendingChange = useCallback((value: boolean) => {
    pending.current = value;
  }, []);
  const warningId = `${useId()}-warning`;
  return (
    <>
      <Button variant="danger" className={className} onClick={() => setOpen(true)}>
        {t.open}
      </Button>
      <Modal
        open={open}
        onClose={onClose}
        title={t.modal.title}
        actions={
          <DeleteAccountForm onCancel={onClose} onPendingChange={onPendingChange} warningId={warningId} />
        }
      >
        <span id={warningId}>{t.modal.body}</span>
      </Modal>
    </>
  );
}

/**
 * Formularz w oknie. Montowany przy każdym otwarciu, więc zaczyna od pustego pola. Akcję wywołujemy sami
 * w onSubmit (bez automatycznego czyszczenia formularza), więc po błędzie wpisane słowo zostaje. Błąd pod
 * polem (aria-describedby) i fokus na polu. W trakcie usuwania „Zostaw konto” jest niedostępne
 * (aria-disabled) z wyjaśnieniem w regionie statusu.
 */
function DeleteAccountForm({
  onCancel,
  onPendingChange,
  warningId,
}: {
  onCancel: () => void;
  onPendingChange: (pending: boolean) => void;
  /** Ostrzeżenie z treści okna — pierwszy opis pola potwierdzenia. */
  warningId: string;
}) {
  const [state, formAction, pending] = useActionState(deleteAccount, INITIAL_STATE);
  const [confirm, setConfirm] = useState('');
  const id = useId();
  const confirmId = `${id}-confirm`;
  const pendingId = `${id}-pending`;
  const fieldError = state.status === 'error' ? state.fieldError : undefined;
  const message = state.status === 'error' ? state.message : undefined;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    onPendingChange(true);
    startTransition(() => formAction(data));
  };

  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);

  useEffect(() => {
    if (state.status === 'error' && state.fieldError) document.getElementById(confirmId)?.focus();
  }, [state, confirmId]);

  return (
    <form onSubmit={submit} className={s.modalForm} noValidate>
      <TextField
        id={confirmId}
        label={t.modal.confirmLabel}
        error={fieldError}
        name="confirm"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={100}
        required
        readOnly={pending}
        wide
        aria-describedby={[warningId, fieldDescribedBy(confirmId, undefined, fieldError)]
          .filter(Boolean)
          .join(' ')}
      />
      {message && (
        <Alert variant="error" title={t.errorTitle}>
          {message}
        </Alert>
      )}
      <p id={pendingId} role="status" className={pending ? 'sd-secondary' : 'sd-visually-hidden'}>
        {pending ? t.modal.pending : ''}
      </p>
      <div className={`sd-modal__actions ${s.modalButtons}`}>
        <Button onClick={onCancel} unavailable={pending} aria-describedby={pending ? pendingId : undefined}>
          {t.modal.cancel}
        </Button>
        <Button type="submit" variant="danger" busy={pending}>
          {t.modal.submit}
        </Button>
      </div>
    </form>
  );
}

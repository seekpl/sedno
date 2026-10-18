'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

type ModalDialogProps = {
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  titleId?: string;
};

/** Sam wygląd okna (sd-modal), bez zachowania — np. do strony z komponentami. Treść opisuje okno (aria-describedby). */
export function ModalDialog({ title, children, actions, titleId }: ModalDialogProps) {
  const autoId = useId();
  const id = titleId ?? autoId;
  const bodyId = `${autoId}-tresc`;
  return (
    <div
      className="sd-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={id}
      aria-describedby={children ? bodyId : undefined}
    >
      <h2 id={id} className="sd-modal__title">
        {title}
      </h2>
      {children && (
        <p id={bodyId} className="sd-modal__body">
          {children}
        </p>
      )}
      {actions && <div className="sd-modal__actions">{actions}</div>}
    </div>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type ModalProps = ModalDialogProps & {
  open: boolean;
  onClose: () => void;
};

/** Okno modalne: pułapka fokusu, Esc zamyka, fokus wraca do elementu, który je otworzył. */
export function Modal({ open, onClose, ...dialog }: ModalProps) {
  const container = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const root = container.current;
    const focusables = () => Array.from(root?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !root?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className={`sd-scrim ${styles.scrim}`}
      ref={container}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <ModalDialog {...dialog} />
    </div>,
    document.body,
  );
}

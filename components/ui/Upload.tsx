'use client';

import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Button } from './Button';
import { Icon } from './Icon';

type UploadProps = {
  title: ReactNode;
  hint?: ReactNode;
  /** Tytuł i podpowiedź w trakcie przeciągania pliku nad obszarem. */
  overTitle?: ReactNode;
  overHint?: ReactNode;
  buttonLabel: string;
  accept?: string;
  onFile: (file: File) => void;
  /**
   * Błąd pliku: obszar w stanie sd-upload--error z przyczyną i naprawą.
   * retryLabel: przycisk wyboru innego pliku (null = bez niego, np. gdy naprawą jest tylko action).
   */
  error?: { title: ReactNode; hint: ReactNode; retryLabel?: string | null; action?: ReactNode };
  /** Tylko do podglądu stanów (strona /dev/komponenty): wymusza wygląd przeciągania. */
  previewOver?: boolean;
  /** Linia prywatności i inne treści pod przyciskiem. */
  children?: ReactNode;
  /** Przycisk na całą szerokość (telefon). */
  blockButton?: boolean;
  className?: string;
};

/**
 * Wgrywanie pliku: przeciąganie (sd-upload--over) i przycisk „Wybierz plik”.
 * Cały przepływ działa z klawiatury przez przycisk. Plik trafia tylko do onFile — nic tu nie wysyła go dalej.
 */
export function Upload({
  title,
  hint,
  overTitle,
  overHint,
  buttonLabel,
  accept,
  onFile,
  error,
  children,
  blockButton,
  className,
  previewOver,
}: UploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  const onDragEnter = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    depth.current += 1;
    setOver(true);
  };
  const onDragLeave = () => {
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    depth.current = 0;
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  const state = over || previewOver ? 'over' : error ? 'error' : 'idle';
  const shown =
    state === 'over'
      ? { title: overTitle ?? title, hint: overHint ?? hint }
      : error
        ? { title: error.title, hint: error.hint }
        : { title, hint };

  return (
    <div
      className={cx(
        'sd-upload',
        state === 'over' && 'sd-upload--over',
        state === 'error' && 'sd-upload--error',
        className,
      )}
      onDragEnter={onDragEnter}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault();
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <Icon name={state === 'error' ? 'error' : 'upload'} size="l" />
      <p className="sd-upload__title">{shown.title}</p>
      {shown.hint && <p className="sd-upload__hint">{shown.hint}</p>}
      {state !== 'over' && (
        <>
          <input
            ref={input}
            type="file"
            accept={accept}
            className="sd-visually-hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) onFile(file);
            }}
          />
          {!(state === 'error' && error?.retryLabel === null) && (
            <Button
              variant={state === 'error' ? 'default' : 'primary'}
              size={blockButton ? 'l' : 'm'}
              block={blockButton}
              onClick={() => input.current?.click()}
            >
              {state === 'error' ? (error?.retryLabel ?? buttonLabel) : buttonLabel}
            </Button>
          )}
          {state === 'error' && error?.action}
        </>
      )}
      {children}
    </div>
  );
}

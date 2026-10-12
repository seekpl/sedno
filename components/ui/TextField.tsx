'use client';

import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';
import { Icon } from './Icon';

type FieldShellProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Pole na całą szerokość kontenera (bez limitu container-text). */
  wide?: boolean;
  className?: string;
  children: ReactNode;
};

export function fieldDescribedBy(id: string, hint?: ReactNode, error?: ReactNode): string | undefined {
  const ids = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

/** Etykieta nad polem, podpowiedź i błąd powiązane przez aria-describedby (sd-field). */
export function FieldShell({ id, label, hint, error, wide, className, children }: FieldShellProps) {
  return (
    <div
      className={cx('sd-field', error ? 'sd-field--error' : undefined, className)}
      style={wide ? { maxWidth: 'none' } : undefined}
    >
      <label className="sd-field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && (
        <span id={`${id}-hint`} className="sd-field__hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="sd-field__error">
          <Icon name="error" size="s" />
          {error}
        </span>
      )}
    </div>
  );
}

type TextFieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  wide?: boolean;
  fieldClassName?: string;
} & (
  | ({ multiline?: false } & InputHTMLAttributes<HTMLInputElement>)
  | ({ multiline: true } & TextareaHTMLAttributes<HTMLTextAreaElement>)
);

export function TextField(props: TextFieldProps) {
  const autoId = useId();
  const { label, hint, error, wide, fieldClassName, multiline, id = autoId, className, ...rest } = props;
  const describedBy = fieldDescribedBy(id, hint, error);
  const common = {
    id,
    className: cx('sd-input', className),
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
  };
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} wide={wide} className={fieldClassName}>
      {multiline ? (
        <textarea {...common} {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)} />
      ) : (
        <input {...common} {...(rest as InputHTMLAttributes<HTMLInputElement>)} />
      )}
    </FieldShell>
  );
}

'use client';

import { useId, useState, type ReactNode } from 'react';
import { parseCount } from '@/lib/parse-count';
import { FieldShell, fieldDescribedBy } from './TextField';

type NumberFieldProps = {
  label: ReactNode;
  value: number | null;
  onChange: (value: number | null) => void;
  hint?: ReactNode;
  /** Tekst błędu dla wpisu, który nie jest liczbą całkowitą ≥ 0. */
  invalidMessage: string;
  placeholder?: string;
  /** Pole liczbowe na całą szerokość (domyślnie sd-input--num ma 160 px). */
  fullWidth?: boolean;
  wide?: boolean;
  id?: string;
  name?: string;
};

/** Pole na liczbę całkowitą (inputmode="numeric", cyfry tabelaryczne, wyrównanie do prawej). */
export function NumberField({
  label,
  value,
  onChange,
  hint,
  invalidMessage,
  placeholder,
  fullWidth,
  wide,
  id: idProp,
  name,
}: NumberFieldProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const [raw, setRaw] = useState(value == null ? '' : String(value));
  const [lastValue, setLastValue] = useState(value);
  // Zmiana wartości z zewnątrz (np. podpowiedź z poprzedniego miesiąca) nadpisuje wpisany tekst.
  if (value !== lastValue) {
    setLastValue(value);
    if (parseCount(raw) !== value) setRaw(value == null ? '' : String(value));
  }
  const parsed = parseCount(raw);
  const error = parsed === 'invalid' ? invalidMessage : undefined;

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} wide={wide}>
      <input
        id={id}
        name={name}
        className="sd-input sd-input--num"
        style={fullWidth ? { maxWidth: 'none' } : undefined}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={raw}
        aria-describedby={fieldDescribedBy(id, hint, error)}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          const next = e.target.value;
          setRaw(next);
          const n = parseCount(next);
          if (n !== 'invalid') {
            setLastValue(n);
            onChange(n);
          }
        }}
      />
    </FieldShell>
  );
}

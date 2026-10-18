'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { FileChip } from '@/components/ui/FileChip';
import { FieldShell, fieldDescribedBy } from '@/components/ui/TextField';
import type { ColumnMapping, RequiredField } from '@/lib/csv/types';
import { columnNames } from '@/lib/copy/csv';
import { tool } from '@/lib/copy/tool';
import { formatFileSize } from '@/lib/i18n/pl';
import { buttonSizes, PrivacyLine, StepHeader, type FlowIds } from './parts';
import type { MappingState } from './state';
import s from './tool.module.css';

const t = tool.mapping;

/** Pola wymagane w kolejności na ekranie. */
export const REQUIRED_FIELDS: readonly RequiredField[] = ['publishedAt', 'views'];

/** Najdłuższy nagłówek w liście wyboru; dłuższe skracamy wielokropkiem (tylko tekst opcji, nie wartość). */
const OPTION_MAX = 60;

export function shortenHeader(header: string): string {
  return header.length > OPTION_MAX ? `${header.slice(0, OPTION_MAX - 1).trimEnd()}…` : header;
}

type Selection = Record<RequiredField, string>;

type MappingStepProps = {
  ids: FlowIds;
  file: { name: string; size: number } | null;
  mapping: MappingState;
  /** Wybór zapamiętany w tej przeglądarce dla nagłówków z tego pliku. */
  initial: Partial<Selection>;
  busy: boolean;
  isPhone: boolean;
  onSubmit: (mapping: ColumnMapping) => void;
  onPickFile: () => void;
  /** Nagłówek zamiast „Przypisz kolumny” (edytor z kontem). Tytuł ekranu zostaje wtedy jako h2. */
  header?: ReactNode;
};

/**
 * Ekran „Przypisz kolumny” (PROMPT.md §6): natywne listy wyboru z nagłówkami pliku dla pól wymaganych.
 * Etykiety nad polami, błędy przez aria-describedby, po nieudanej próbie fokus na pierwszym złym polu.
 */
export function MappingStep({
  ids,
  file,
  mapping,
  initial,
  busy,
  isPhone,
  onSubmit,
  onPickFile,
  header,
}: MappingStepProps) {
  const sizes = buttonSizes(isPhone);
  const headers = [...new Set(mapping.headers.map((h) => h.trim()).filter(Boolean))];
  const [selected, setSelected] = useState<Selection>(() => ({
    publishedAt: initial.publishedAt && headers.includes(initial.publishedAt) ? initial.publishedAt : '',
    views: initial.views && headers.includes(initial.views) ? initial.views : '',
  }));
  const [errors, setErrors] = useState<Partial<Record<RequiredField, string>>>({});

  const errorFor = (field: RequiredField): string | undefined => {
    if (errors[field]) return errors[field];
    const failed = mapping.failed;
    if (failed && failed.field === field && selected[field] === failed.header) {
      return t.errors.noMatch(failed.header, columnNames[field]);
    }
    return undefined;
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const next: Partial<Record<RequiredField, string>> = {};
    for (const field of REQUIRED_FIELDS) {
      if (!selected[field]) next[field] = t.errors.required(columnNames[field]);
    }
    if (!next.publishedAt && !next.views && selected.publishedAt === selected.views)
      next.views = t.errors.same;
    setErrors(next);
    const firstInvalid = REQUIRED_FIELDS.find((field) => next[field]);
    if (firstInvalid) {
      document.getElementById(ids.mapping(firstInvalid))?.focus();
      return;
    }
    // Mapowanie: oryginalny nagłówek → pole (zapamiętywane dopiero po udanym wczytaniu).
    onSubmit(Object.fromEntries(REQUIRED_FIELDS.map((field) => [selected[field], field])));
  };

  return (
    <div className={s.narrow}>
      {header ? (
        <>
          {header}
          <h2 className="heading-3">{t.heading}</h2>
        </>
      ) : (
        <StepHeader id={ids.heading} caption={tool.stepCaption(1)} title={t.heading} />
      )}
      {file && <FileChip name={file.name} size={formatFileSize(file.size)} />}
      <p>{t.lead}</p>

      <form className={s.form} onSubmit={submit} noValidate>
        <div className={s.fields}>
          {REQUIRED_FIELDS.map((field) => {
            const id = ids.mapping(field);
            const error = errorFor(field);
            return (
              <FieldShell key={field} id={id} label={columnNames[field]} error={error} wide>
                <select
                  id={id}
                  className="sd-input"
                  value={selected[field]}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={fieldDescribedBy(id, undefined, error)}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelected((current) => ({ ...current, [field]: value }));
                    setErrors((current) => ({ ...current, [field]: undefined }));
                  }}
                >
                  <option value="">{t.placeholder}</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {shortenHeader(header)}
                    </option>
                  ))}
                </select>
              </FieldShell>
            );
          })}
        </div>
        <div className={s.buttons}>
          <Button type="submit" variant="primary" size={sizes.main} block={isPhone} busy={busy}>
            {t.submit}
          </Button>
          <Button size={sizes.main} block={isPhone} onClick={onPickFile}>
            {tool.upload.retry}
          </Button>
        </div>
      </form>

      <PrivacyLine />
    </div>
  );
}

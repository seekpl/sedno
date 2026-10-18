'use client';

import { useState, useTransition } from 'react';
import { removeLogo, uploadLogo, type LogoErrorCode, type LogoState } from '@/app/app/ustawienia/actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Upload } from '@/components/ui/Upload';
import { settings } from '@/lib/copy/settings';
import { LOGO_MAX_BYTES } from '@/lib/logo/validate';
import s from './Settings.module.css';

const t = settings.logo;
const IDLE: LogoState = { status: 'idle' };

/** Typy przyjmowane przez pole pliku (filtr okna wyboru pliku). */
export const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp';

/**
 * Wstępne sprawdzenie w przeglądarce, żeby nie wysyłać pliku, który serwer na pewno odrzuci — Next odrzuca
 * ciało akcji większe niż 3 MB, zanim akcja zdąży odpowiedzieć przyczyną. Typ zgłoszony przez przeglądarkę
 * bywa nietypowy dla poprawnego pliku (image/pjpeg, image/x-png, pusty), więc odrzucamy tu tylko SVG i pliki,
 * które nie są obrazami. O typie rozstrzyga serwer po sygnaturze bajtów.
 */
export function precheckLogo(file: { size: number; type: string }): LogoErrorCode | null {
  if (file.size === 0) return 'empty';
  if (file.size > LOGO_MAX_BYTES) return 'tooBig';
  const type = file.type.toLowerCase();
  if (type.includes('svg') || (type !== '' && !type.startsWith('image/'))) return 'unsupported';
  return null;
}

type Shown = { hasLogo: boolean; version: string };

/**
 * „Logo”: podgląd obecnego logo (z /app/logo), wgrywanie (przeciągnięcie albo „Wybierz plik”, sd-upload)
 * i „Usuń logo”. Wynik w powiadomieniu („Logo wgrane”, „Logo usunięte”), błąd pliku w polu wgrywania
 * z przyczyną i naprawą, pozostałe błędy w komunikacie. Po usunięciu fokus wraca na nagłówek sekcji.
 */
export function LogoSection({
  hasLogo,
  version,
  headingId,
}: {
  hasLogo: boolean;
  version: string;
  /** Nagłówek sekcji (tabIndex=-1) — tu wraca fokus, gdy znika przycisk „Usuń logo”. */
  headingId: string;
}) {
  const [shown, setShown] = useState<Shown>({ hasLogo, version });
  const [fileError, setFileError] = useState<LogoErrorCode | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const toast = useToast();

  const apply = (result: LogoState) => {
    if (result.status === 'success') {
      setShown({ hasLogo: result.hasLogo, version: result.version });
      toast({ message: result.result === 'uploaded' ? t.uploaded : t.removed });
      if (result.result === 'removed') {
        window.setTimeout(() => document.getElementById(headingId)?.focus(), 0);
      }
    } else if (result.status === 'error') {
      if (result.code) setFileError(result.code);
      else setMessage(result.message ?? t.errors.failed);
    }
  };

  const run = (kind: 'upload' | 'remove', call: () => Promise<LogoState>) => {
    if (pending) return;
    setFileError(null);
    setMessage(null);
    setBusy(kind);
    startTransition(async () => {
      let result: LogoState;
      try {
        result = await call();
      } catch {
        // Np. zerwane połączenie albo ciało odrzucone przez serwer przed akcją.
        result = { status: 'error', message: t.errors.failed };
      }
      startTransition(() => {
        setBusy(null);
        apply(result);
      });
    });
  };

  const onFile = (file: File) => {
    const local = precheckLogo(file);
    if (local) {
      setMessage(null);
      setFileError(local);
      return;
    }
    const data = new FormData();
    data.set('logo', file);
    run('upload', () => uploadLogo(IDLE, data));
  };

  const error = fileError ? t.errors[fileError] : null;

  return (
    <>
      {shown.hasLogo ? (
        <div className={s.logoPreview}>
          {/* Obraz z własnej trasy (/app/logo), bez optymalizacji next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={s.logoImage} src={`/app/logo?v=${encodeURIComponent(shown.version)}`} alt={t.alt} />
          <Button variant="ghost" busy={busy === 'remove'} onClick={() => run('remove', () => removeLogo())}>
            {t.remove}
          </Button>
        </div>
      ) : (
        <p className="sd-secondary">{t.none}</p>
      )}
      <Upload
        title={t.upload.title}
        hint={t.upload.hint}
        overTitle={t.upload.overTitle}
        overHint={t.upload.overHint}
        buttonLabel={t.upload.button}
        accept={LOGO_ACCEPT}
        onFile={onFile}
        error={error ? { title: error.title, hint: error.hint, retryLabel: t.upload.retry } : undefined}
      />
      {busy === 'upload' && (
        <p className="sd-secondary" aria-hidden="true">
          {t.uploading}
        </p>
      )}
      {/* Regiony ogłaszane przez czytniki ekranu: trwające wgrywanie i błąd pliku (widoczny w polu). */}
      <p role="status" className="sd-visually-hidden">
        {busy === 'upload' ? t.uploading : ''}
      </p>
      <p role="alert" className="sd-visually-hidden">
        {error ? `${error.title}. ${error.hint}` : ''}
      </p>
      {message && (
        <Alert variant="error" title={t.errorTitle}>
          {message}
        </Alert>
      )}
    </>
  );
}

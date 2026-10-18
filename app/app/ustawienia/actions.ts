'use server';

/**
 * Akcje Ustawień (PROMPT.md §8 Storage, §10, §15 RODO). Dla useActionState w formularzach ekranu.
 *
 * - Tylko zalogowany użytkownik i tylko z włączonymi kontami. Profil zmienia sesja użytkownika (RLS i granty
 *   kolumnowe: tylko imię i nazwa na raporcie); logo i usunięcie konta — serwer kluczem serwisowym, zawsze
 *   dla użytkownika z sesji (nigdy dla identyfikatora z formularza).
 * - zod na wejściu każdej akcji. Logo: najpierw rozmiar z metadanych pliku (bez czytania całości), potem
 *   sygnatura bajtów (lib/logo/validate.ts: PNG, JPEG albo WebP do 2 MB, bez SVG).
 * - Limity na konto (pamięć procesu, lib/server/rate-limit.ts).
 * - Akcje nie rzucają wyjątków i nie zwracają treści błędów bazy; nie logujemy nazw ani adresów e-mail.
 */
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { features } from '@/config/features';
import { getCurrentUser } from '@/lib/auth/session';
import { DELETE_CONFIRM_WORD, settings as t } from '@/lib/copy/settings';
import { deleteAccount as deleteAccountData } from '@/lib/data/account';
import { profileInputSchema, updateProfile as saveProfile } from '@/lib/data/profile';
import { removeLogo as removeLogoFiles, saveLogo } from '@/lib/logo/store';
import { checkLogo, LOGO_MAX_BYTES } from '@/lib/logo/validate';
import { rateLimit } from '@/lib/server/rate-limit';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { z } from '@/lib/zod';

// Plik 'use server' eksportuje wyłącznie akcje (i typy): każda eksportowana funkcja byłaby punktem
// wywołania z przeglądarki. Stałe i pomocnicze funkcje zostają prywatne.

const SETTINGS_PATH = '/app/ustawienia';
const WINDOW_MS = 10 * 60_000;
const PROFILE_LIMIT = 30;
const LOGO_LIMIT = 20;
const DELETE_LIMIT = 5;

/** Ciasteczka sesji Supabase (jak w app/auth/wyloguj/route.ts). */
const SESSION_COOKIE = /^sb-.+-auth-token(?:[.-].*)?$/;

function field(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

/* ---------- Profil i marka ---------- */

export type ProfileState =
  | { status: 'idle' }
  | { status: 'success'; displayName: string | null; brandName: string | null }
  | {
      status: 'error';
      /** Wpisane wartości — formularz pokazuje je dalej po błędzie (także bez JavaScriptu). */
      values: { displayName: string; brandName: string };
      fieldErrors?: { displayName?: string; brandName?: string };
      message?: string;
    };

export async function updateProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const values = {
    displayName: (field(formData, 'displayName') ?? '').slice(0, 2000),
    brandName: (field(formData, 'brandName') ?? '').slice(0, 2000),
  };
  try {
    return await updateProfileFor(formData, values);
  } catch {
    console.error('[sedno] Zapis profilu nie powiódł się.');
    return { status: 'error', values, message: t.profile.errors.failed };
  }
}

async function updateProfileFor(
  formData: FormData,
  values: { displayName: string; brandName: string },
): Promise<ProfileState> {
  if (!features.accounts) return { status: 'error', values, message: t.profile.errors.failed };
  const user = await getCurrentUser();
  if (!user) return { status: 'error', values, message: t.profile.errors.session };

  const input = {
    displayName: field(formData, 'displayName') ?? '',
    brandName: field(formData, 'brandName') ?? '',
  };
  const parsed = profileInputSchema.safeParse(input);
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    const fieldErrors: { displayName?: string; brandName?: string } = {};
    if (errors.displayName?.[0]) fieldErrors.displayName = errors.displayName[0];
    if (errors.brandName?.[0]) fieldErrors.brandName = errors.brandName[0];
    return { status: 'error', values, fieldErrors };
  }

  if (!rateLimit(`settings:profile:${user.id}`, PROFILE_LIMIT, WINDOW_MS)) {
    return { status: 'error', values, message: t.profile.errors.rateLimited };
  }

  const db = await createSupabaseServerClient();
  const saved = await saveProfile(db, user.id, input);
  revalidatePath(SETTINGS_PATH);
  return { status: 'success', ...saved };
}

/* ---------- Logo ---------- */

export type LogoErrorCode = 'noFile' | 'empty' | 'tooBig' | 'unsupported';

export type LogoState =
  | { status: 'idle' }
  | { status: 'success'; result: 'uploaded' | 'removed'; hasLogo: boolean; version: string }
  | { status: 'error'; code?: LogoErrorCode; message?: string };

const logoFileSchema = z.file({ error: 'noFile' });

/** Wgranie logo: pole formularza `logo` (plik). */
export async function uploadLogo(_prev: LogoState, formData: FormData): Promise<LogoState> {
  try {
    return await uploadLogoFor(formData);
  } catch {
    console.error('[sedno] Zapis logo nie powiódł się.');
    return { status: 'error', message: t.logo.errors.failed };
  }
}

async function uploadLogoFor(formData: FormData): Promise<LogoState> {
  if (!features.accounts) return { status: 'error', message: t.logo.errors.failed };
  const user = await getCurrentUser();
  if (!user) return { status: 'error', message: t.logo.errors.session };

  const parsed = logoFileSchema.safeParse(formData.get('logo'));
  if (!parsed.success) return { status: 'error', code: 'noFile' };
  const file = parsed.data;
  // Formularz bez wybranego pliku wysyła pusty plik bez nazwy.
  if (file.size === 0 && file.name === '') return { status: 'error', code: 'noFile' };
  // Rozmiar z metadanych, zanim przeczytamy plik (Next i tak odrzuca ciało większe niż 3 MB).
  if (file.size === 0) return { status: 'error', code: 'empty' };
  if (file.size > LOGO_MAX_BYTES) return { status: 'error', code: 'tooBig' };

  if (!rateLimit(`settings:logo:${user.id}`, LOGO_LIMIT, WINDOW_MS)) {
    return { status: 'error', message: t.logo.errors.rateLimited };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkLogo(bytes);
  if (!check.ok) {
    const code = check.reason === 'too-big' ? 'tooBig' : check.reason;
    return { status: 'error', code };
  }

  await saveLogo(user.id, bytes, { ext: check.ext, contentType: check.contentType });
  revalidatePath(SETTINGS_PATH);
  return { status: 'success', result: 'uploaded', hasLogo: true, version: Date.now().toString(36) };
}

/** „Usuń logo”: pliki w zasobniku i ścieżka w profilu. Bez danych wejściowych (zawsze logo z sesji). */
export async function removeLogo(): Promise<LogoState> {
  try {
    if (!features.accounts) return { status: 'error', message: t.logo.errors.failed };
    const user = await getCurrentUser();
    if (!user) return { status: 'error', message: t.logo.errors.session };
    if (!rateLimit(`settings:logo:${user.id}`, LOGO_LIMIT, WINDOW_MS)) {
      return { status: 'error', message: t.logo.errors.rateLimited };
    }
    await removeLogoFiles(user.id);
    revalidatePath(SETTINGS_PATH);
    return { status: 'success', result: 'removed', hasLogo: false, version: Date.now().toString(36) };
  } catch {
    console.error('[sedno] Usunięcie logo nie powiodło się.');
    return { status: 'error', message: t.logo.errors.failed };
  }
}

/* ---------- Usunięcie konta ---------- */

export type DeleteAccountState =
  { status: 'idle' } | { status: 'error'; fieldError?: string; message?: string };

/**
 * Potwierdzenie: słowo „usuń” (wielkość liter i białe znaki bez znaczenia; „usun” bez polskiej litery też,
 * dla klawiatur bez polskiego układu).
 */
const confirmSchema = z
  .string({ error: t.deleteAccount.errors.confirm })
  .max(100, { error: t.deleteAccount.errors.confirm })
  .transform((value) => value.normalize('NFC').trim().toLocaleLowerCase('pl-PL'))
  .refine((value) => value === DELETE_CONFIRM_WORD || value === 'usun', {
    error: t.deleteAccount.errors.confirm,
  });

/**
 * Usunięcie konta: plik logo, użytkownik Supabase Auth (kaskada usuwa profil, klientów, raporty i linki),
 * potem koniec sesji na tym urządzeniu i przekierowanie na stronę główną.
 */
export async function deleteAccount(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  try {
    const failed = await deleteAccountFor(formData);
    if (failed) return failed;
  } catch {
    console.error('[sedno] Usunięcie konta nie powiodło się.');
    return { status: 'error', message: t.deleteAccount.errors.failed };
  }
  // Poza try: redirect() przerywa akcję wyjątkiem, który obsługuje Next.
  redirect('/');
}

async function deleteAccountFor(formData: FormData): Promise<DeleteAccountState | null> {
  if (!features.accounts) return { status: 'error', message: t.deleteAccount.errors.failed };
  const user = await getCurrentUser();
  if (!user) return { status: 'error', message: t.deleteAccount.errors.session };

  const confirm = confirmSchema.safeParse(field(formData, 'confirm') ?? '');
  if (!confirm.success) return { status: 'error', fieldError: t.deleteAccount.errors.confirm };

  if (!rateLimit(`settings:delete:${user.id}`, DELETE_LIMIT, WINDOW_MS)) {
    return { status: 'error', message: t.deleteAccount.errors.rateLimited };
  }

  await deleteAccountData(createSupabaseAdminClient(), user.id);
  // Konto już nie istnieje: błąd przy kończeniu sesji nie może zgłosić, że „konto nadal działa”.
  try {
    await endSession();
  } catch {
    console.error('[sedno] Po usunięciu konta nie udało się usunąć ciasteczek sesji.');
  }
  return null;
}

/**
 * Koniec sesji po usunięciu konta: wylogowanie w Supabase Auth (gdy użytkownika już nie ma, biblioteka
 * i tak czyści sesję) i usunięcie ciasteczek sesji. Błąd wylogowania nie cofa usunięcia konta.
 */
async function endSession() {
  try {
    const db = await createSupabaseServerClient();
    await db.auth.signOut({ scope: 'local' });
  } catch {
    // Konto jest już usunięte; ciasteczka usuwamy niżej.
  }
  const store = await cookies();
  for (const { name } of store.getAll()) {
    if (SESSION_COOKIE.test(name)) store.delete(name);
  }
}

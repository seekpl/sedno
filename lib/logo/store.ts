import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { detectLogo, type LogoKind } from './validate';

/**
 * Prywatny zasobnik „logos” (migracja 20261013000000): ścieżka {owner_id}/logo.{png|jpg|webp}. Tylko serwer,
 * kluczem serwisowym, zawsze po sprawdzeniu właściciela przez wywołującego (sesja w /app, aktywny link w /r).
 * Ustawienie profiles.logo_path też robi serwer (kolumna niedostępna dla użytkownika).
 */
const BUCKET = 'logos';
const EXTENSIONS = ['png', 'jpg', 'webp'] as const;
const PATH = /^[0-9a-f-]{36}\/logo\.(png|jpg|webp)$/;

export const logoPath = (ownerId: string, ext: LogoKind['ext']) => `${ownerId}/logo.${ext}`;

/** Magazyn albo baza nie odpowiedziały (nie „brak pliku”): trasy odpowiadają 503, akcje — błędem z naprawą. */
export class LogoStoreError extends Error {}

/** „Nie ma takiego pliku” w Supabase Storage (HTTP 404 albo 400 z kodem 404) i w emulatorze lokalnego stosu. */
function isNotFound(error: unknown): boolean {
  const { status, statusCode } = (error ?? {}) as { status?: number; statusCode?: string };
  return status === 404 || statusCode === '404' || statusCode === 'NoSuchKey';
}

/**
 * Zapisuje logo (bajty już sprawdzone checkLogo): plik, potem logo_path, na końcu usuwa wersje w innych
 * formatach. Ta kolejność sprawia, że profil nigdy nie wskazuje usuniętego pliku (np. gdy zapis profilu się nie
 * uda). Nieudane sprzątanie starych formatów nie jest błędem: logo_path wskazuje już nowy plik, a usunięcie
 * konta i „Usuń logo” usuwają wszystkie formaty.
 */
export async function saveLogo(ownerId: string, bytes: Uint8Array, kind: LogoKind): Promise<string> {
  const admin = createSupabaseAdminClient();
  const path = logoPath(ownerId, kind.ext);
  const upload = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: kind.contentType, upsert: true, cacheControl: '0' });
  if (upload.error) throw new LogoStoreError('Zapis logo nie powiódł się.');
  const profile = await admin
    .from('profiles')
    .update({ logo_path: path } as never)
    .eq('id', ownerId);
  if (profile.error) throw new LogoStoreError('Zapis logo w profilu nie powiódł się.');
  const others = EXTENSIONS.filter((ext) => ext !== kind.ext).map((ext) => logoPath(ownerId, ext));
  await admin.storage.from(BUCKET).remove(others);
  return path;
}

/**
 * Usuwa logo: najpierw czyści logo_path (raport od razu pokazuje nazwę i nigdy nie wskazuje usuniętego
 * pliku), potem pliki we wszystkich formatach. Każdy błąd → LogoStoreError, żeby nikt nie zgłosił sukcesu,
 * którego nie było; ponowne wywołanie dokańcza sprzątanie.
 */
export async function removeLogo(ownerId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const profile = await admin
    .from('profiles')
    .update({ logo_path: null } as never)
    .eq('id', ownerId);
  if (profile.error) throw new LogoStoreError('Czyszczenie logo w profilu nie powiodło się.');
  const removed = await admin.storage.from(BUCKET).remove(EXTENSIONS.map((ext) => logoPath(ownerId, ext)));
  if (removed.error) throw new LogoStoreError('Usunięcie plików logo nie powiodło się.');
}

/**
 * Bajty logo spod ścieżki z profilu; typ z sygnatury pliku. null, gdy pliku nie ma albo ścieżka jest
 * nieprawidłowa; LogoStoreError, gdy magazyn nie odpowiedział (trasy odpowiadają wtedy 503, nie 404).
 */
export async function readLogo(
  path: string | null,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (!path || !PATH.test(path)) return null;
  const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).download(path);
  if (error) {
    if (isNotFound(error)) return null;
    throw new LogoStoreError('Odczyt logo nie powiódł się.');
  }
  if (!data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  const kind = detectLogo(bytes);
  return kind ? { bytes, contentType: kind.contentType } : null;
}

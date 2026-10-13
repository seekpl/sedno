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

/** Zapisuje logo (bajty już sprawdzone checkLogo), usuwa wersje w innych formatach i ustawia logo_path. */
export async function saveLogo(ownerId: string, bytes: Uint8Array, kind: LogoKind): Promise<string> {
  const admin = createSupabaseAdminClient();
  const path = logoPath(ownerId, kind.ext);
  const upload = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: kind.contentType, upsert: true, cacheControl: '0' });
  if (upload.error) throw new Error('Zapis logo nie powiódł się.');
  const others = EXTENSIONS.filter((ext) => ext !== kind.ext).map((ext) => logoPath(ownerId, ext));
  await admin.storage.from(BUCKET).remove(others);
  const profile = await admin
    .from('profiles')
    .update({ logo_path: path } as never)
    .eq('id', ownerId);
  if (profile.error) throw new Error('Zapis logo w profilu nie powiódł się.');
  return path;
}

/** Usuwa wszystkie pliki logo właściciela i czyści logo_path. */
export async function removeLogo(ownerId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin.storage.from(BUCKET).remove(EXTENSIONS.map((ext) => logoPath(ownerId, ext)));
  await admin
    .from('profiles')
    .update({ logo_path: null } as never)
    .eq('id', ownerId);
}

/** Bajty logo spod ścieżki z profilu; typ z sygnatury pliku. null, gdy brak albo ścieżka nieprawidłowa. */
export async function readLogo(
  path: string | null,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (!path || !PATH.test(path)) return null;
  const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).download(path);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  const kind = detectLogo(bytes);
  return kind ? { bytes, contentType: kind.contentType } : null;
}

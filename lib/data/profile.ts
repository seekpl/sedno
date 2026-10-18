import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PROFILE_NAME_MAX } from '@/components/app/settings/limits';
import { settings as t } from '@/lib/copy/settings';
import { stripEmoji } from '@/lib/report/compute';
import type { Database, Enums } from '@/lib/supabase/database.types';
import { z } from '@/lib/zod';

/**
 * Profil zalogowanego użytkownika (Ustawienia, plakietka planu). Pierwszy parametr to klient Supabase:
 * w aplikacji sesja użytkownika (RLS — widać i zmienia się tylko własny profil), w testach bazy klient
 * testowego użytkownika. Klucza serwisowego tu nie używamy: plan i ścieżkę logo zmienia wyłącznie serwer
 * (granty kolumnowe w supabase/migrations/20261013000000_accounts.sql).
 */
type Db = SupabaseClient<Database>;

export type Plan = Enums<'plan_t'>;

export type Profile = {
  displayName: string | null;
  brandName: string | null;
  plan: Plan;
  hasLogo: boolean;
  createdAt: string;
};

/** Błąd odczytu lub zapisu bez treści błędu bazy (ta nie trafia do interfejsu ani logów). */
export class ProfileDataError extends Error {
  constructor(readonly step: 'read' | 'update' | 'not-found') {
    super(`Profil: operacja „${step}” nie powiodła się.`);
    this.name = 'ProfileDataError';
  }
}

export { PROFILE_NAME_MAX };

/** Znaki formatujące (\p{Cf}: m.in. znaki zerowej szerokości i sterowanie kierunkiem tekstu). */
const FORMAT_CHARS = /\p{Cf}/gu;
/** To samo bez łącznika U+200D, który skleja emoji złożone (np. 👩‍💻) — dla pola, które zachowuje emoji. */
const FORMAT_CHARS_EXCEPT_ZWJ = /(?!\u200d)\p{Cf}/gu;

/**
 * Pole tekstowe profilu, czyszczone jak nazwa klienta (lib/data/panel.ts): NFC, bez znaków formatujących
 * i sterujących, białe znaki zwinięte do jednej spacji, przycięte. Puste po oczyszczeniu → null (pole
 * nieobowiązkowe). Bez `keepEmoji` usuwa emoji (nazwa na raporcie: kroje marki ich nie mają, raport i PDF
 * i tak je usuwają — docs/decisions.md, p. 42).
 */
function nameField(tooLong: string, { keepEmoji }: { keepEmoji: boolean }) {
  return z
    .string()
    .max(2000, { error: tooLong })
    .transform((value) => {
      const text = keepEmoji ? value.normalize('NFC') : stripEmoji(value.normalize('NFC'));
      return text
        .replace(keepEmoji ? FORMAT_CHARS_EXCEPT_ZWJ : FORMAT_CHARS, '')
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    })
    .refine((value) => Array.from(value).length <= PROFILE_NAME_MAX, { error: tooLong })
    .transform((value) => (value === '' ? null : value));
}

/** Dane formularza „Profil i marka”. Tylko te dwa pola — reszta profilu nie jest do zmiany przez użytkownika. */
export const profileInputSchema = z.object({
  // prefault: brak pola to pusty tekst, który przechodzi to samo czyszczenie (wynik null).
  displayName: nameField(t.profile.errors.displayNameTooLong, { keepEmoji: true }).prefault(''),
  brandName: nameField(t.profile.errors.brandNameTooLong, { keepEmoji: false }).prefault(''),
});

export type ProfileInput = z.input<typeof profileInputSchema>;
export type ProfileNames = { displayName: string | null; brandName: string | null };

/** Profil zalogowanego użytkownika; null, gdy profilu nie ma (adres jeszcze niepotwierdzony). */
export async function getProfile(db: Db): Promise<Profile | null> {
  const { data, error } = await db
    .from('profiles')
    .select('display_name, brand_name, plan, logo_path, created_at')
    .maybeSingle();
  if (error) throw new ProfileDataError('read');
  if (!data) return null;
  return {
    displayName: data.display_name,
    brandName: data.brand_name,
    plan: data.plan,
    hasLogo: data.logo_path != null,
    createdAt: data.created_at,
  };
}

/** Plan z profilu (plakietka w pasku aplikacji). Bez profilu — plan darmowy. */
export async function getPlan(db: Db): Promise<Plan> {
  const { data, error } = await db.from('profiles').select('plan').maybeSingle();
  if (error) throw new ProfileDataError('read');
  return data?.plan ?? 'free';
}

/**
 * Zapisuje imię i nazwę na raporcie. Rzuca ZodError przy złych danych, ProfileDataError przy błędzie bazy
 * albo braku profilu. RLS i granty kolumnowe pozwalają zmienić tylko te dwie kolumny własnego profilu.
 */
export async function updateProfile(db: Db, userId: string, input: ProfileInput): Promise<ProfileNames> {
  const { displayName, brandName } = profileInputSchema.parse(input);
  const { data, error } = await db
    .from('profiles')
    .update({ display_name: displayName, brand_name: brandName })
    .eq('id', userId)
    .select('display_name, brand_name')
    .maybeSingle();
  if (error) throw new ProfileDataError('update');
  if (!data) throw new ProfileDataError('not-found');
  return { displayName: data.display_name, brandName: data.brand_name };
}

/** Ścieżka logo z własnego profilu (RLS); null bez logo albo bez profilu. */
export async function getLogoPath(db: Db): Promise<string | null> {
  const { data, error } = await db.from('profiles').select('logo_path').maybeSingle();
  if (error) throw new ProfileDataError('read');
  return data?.logo_path ?? null;
}

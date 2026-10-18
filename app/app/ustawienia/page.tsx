import type { Metadata } from 'next';
import { AppShell } from '@/components/app/AppShell';
import { SettingsLoadError, SettingsView } from '@/components/app/settings/SettingsView';
import { PLANS } from '@/config/pricing';
import { requireUser } from '@/lib/auth/session';
import { settings } from '@/lib/copy/settings';
import { getProfile, type Profile } from '@/lib/data/profile';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: settings.meta.title };

/**
 * Ustawienia /app/ustawienia (PROMPT.md §10, EkranCennik.html): profil i marka, logo, plan, eksport danych,
 * usunięcie konta, wylogowanie. Dane z sesji użytkownika (RLS). Logowanie i flagę kont sprawdza
 * app/app/layout.tsx; tu sesja jeszcze raz, bo potrzebny jest adres e-mail.
 */
export default async function SettingsPage() {
  const user = await requireUser('/app/ustawienia');

  let profile: Profile | null = null;
  try {
    profile = await getProfile(await createSupabaseServerClient());
  } catch {
    // Bez treści błędu bazy w logu.
    console.error('[sedno] Ustawienia: nie udało się wczytać profilu.');
  }

  return (
    <AppShell current="ustawienia" plan={profile ? PLANS[profile.plan].name : undefined}>
      {profile ? (
        <SettingsView profile={profile} email={user.email ?? null} logoVersion={logoVersion()} />
      ) : (
        <SettingsLoadError />
      )}
    </AppShell>
  );
}

/** Nowa wartość przy każdym wyświetleniu strony: podgląd logo zawsze z bieżącej wersji pliku. */
function logoVersion(): string {
  return Date.now().toString(36);
}

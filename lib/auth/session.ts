import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { features } from '@/config/features';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { safeNextPath } from './next-path';

/**
 * Zalogowany użytkownik (jedno zapytanie na żądanie) albo null. Bez flagi kont (albo bez konfiguracji
 * Supabase, decyzja 94) zawsze null — bez sięgania po Supabase, także przy budowaniu stron.
 */
export const getCurrentUser = cache(async () => {
  if (!features.accounts) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Strony i akcje /app: bez sesji przekierowanie na logowanie z powrotem pod tę samą ścieżkę. Bez flagi kont
 * 404 (jak układ /app), więc strona bez parametrów (np. /app/ustawienia) buduje się jako 404, a nie błąd.
 */
export async function requireUser(nextPath?: string) {
  if (!features.accounts) notFound();
  const user = await getCurrentUser();
  if (!user) redirect(`/logowanie?next=${encodeURIComponent(safeNextPath(nextPath))}`);
  return user;
}

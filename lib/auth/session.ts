import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { safeNextPath } from './next-path';

/** Zalogowany użytkownik (jedno zapytanie na żądanie) albo null. */
export const getCurrentUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** Strony i akcje /app: bez sesji przekierowanie na logowanie z powrotem pod tę samą ścieżkę. */
export async function requireUser(nextPath?: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/logowanie?next=${encodeURIComponent(safeNextPath(nextPath))}`);
  return user;
}

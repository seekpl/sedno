import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './database.types';
import { requireSupabasePublicEnv, SESSION_COOKIE_OPTIONS } from './env';

/**
 * Klient Supabase w Server Components, Server Actions i trasach: sesja użytkownika z ciasteczek, więc
 * każde zapytanie przechodzi przez RLS jako ten użytkownik. Klucz serwisowy jest w lib/supabase/admin.ts.
 */
export async function createSupabaseServerClient() {
  const { url, anonKey } = requireSupabasePublicEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(url, anonKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    auth: { flowType: 'pkce' },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Server Component nie może ustawiać ciasteczek; sesję odświeża proxy.ts.
        }
      },
    },
  });
}

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { requireSupabasePublicEnv } from './env';

/** Limit czasu zapytań serwera do Supabase (jak w lib/server/store.ts). */
const TIMEOUT_MS = 8000;

/**
 * Klient z kluczem serwisowym (omija RLS). Tylko na serwerze i tylko tam, gdzie RLS nie wystarcza:
 * magazyn logo (po sprawdzeniu właściciela), usunięcie konta, zdarzenia, odczyt logo do linku publicznego.
 */
export function createSupabaseAdminClient() {
  const { url } = requireSupabasePublicEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error('Brak SUPABASE_SERVICE_ROLE_KEY.');
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }) },
  });
}

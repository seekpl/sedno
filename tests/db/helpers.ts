/**
 * Pomocnicy testów bazy na lokalnym stosie Supabase (scripts/local-supabase). Użytkownicy powstają przez
 * API administracyjne Supabase Auth (potwierdzony e-mail → trigger tworzy profil), a ich żądania idą przez
 * PostgREST z JWT podpisanym sekretem lokalnego stosu — tak jak żądania zalogowanej przeglądarki.
 */
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';
import type { Database } from '@/lib/supabase/database.types';
import {
  ANON_KEY,
  DB_URL,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
  signJwt,
} from '../../scripts/local-supabase/config';

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export const admin: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  noSession,
);
export const anon: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, ANON_KEY, noSession);

export type TestUser = { id: string; email: string; db: SupabaseClient<Database> };

/** Klient PostgREST działający jako zalogowany użytkownik (RLS jak w przeglądarce). */
export function clientFor(userId: string): SupabaseClient<Database> {
  const now = Math.floor(Date.now() / 1000);
  const token = signJwt({
    sub: userId,
    role: 'authenticated',
    aud: 'authenticated',
    iat: now,
    exp: now + 3600,
  });
  return createClient<Database>(SUPABASE_URL, ANON_KEY, {
    ...noSession,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/** Nowy użytkownik z potwierdzonym adresem (profil tworzy trigger handle_user_confirmed). */
export async function createUser(label = 'u'): Promise<TestUser> {
  const email = `${label}-${randomUUID()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  return { id: data.user.id, email, db: clientFor(data.user.id) };
}

export async function deleteUser(id: string) {
  await admin.auth.admin.deleteUser(id);
}

/** Zapytanie SQL jako superużytkownik (sprawdzanie stanu, którego RLS nie pokazuje). */
export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Losowy token linku w formacie z migracji (do testów; produkcyjny generator: lib/links/token.ts). */
export function testToken(): string {
  let out = '';
  for (const byte of crypto.getRandomValues(new Uint8Array(22))) out += BASE62[byte % 62];
  return out;
}

/** Minimalny poprawny ReportData do zapisu w bazie (kształt z lib/report/types.ts). */
export function sampleReportData(period = '2026-09', client = 'Studio Lumi') {
  return {
    period,
    client: { name: client },
    author: { name: 'Kadr Social' },
    branding: 'sedno-footer',
    summary: {
      posts: 3,
      byType: { reel: 2, post: 1 },
      views: 1200,
      interactions: 80,
      follows: 5,
      topPosts: [],
    },
    actions: { book: 23, call: 9, directions: 14 },
    keyMetric: 'book',
    headline: '23 osoby chciały się umówić',
    dataRange: { from: `${period}-01T00:00:00+02:00`, to: `${period}-28T00:00:00+02:00` },
    flags: {},
  };
}

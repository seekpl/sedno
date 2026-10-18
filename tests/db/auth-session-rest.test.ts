/**
 * Token sesji wydany przez Supabase Auth (nie podpisany w teście) działa w PostgREST: ma rolę
 * „authenticated” i czyta własny profil przez RLS. Pilnuje konfiguracji stosu (GOTRUE_JWT_DEFAULT_GROUP_NAME)
 * — bez niej token ma role "" i każde zapytanie aplikacji kończy się 401, choć testy z własnym JWT przechodzą.
 */
import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';
import type { Database } from '@/lib/supabase/database.types';
import { ANON_KEY, SUPABASE_URL } from '../../scripts/local-supabase/config';
import { admin } from './helpers';

const email = `sesja-${Date.now()}@example.com`;
const password = `Haslo-${Date.now()}-testowe`;
let userId = '';

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe('token sesji z Supabase Auth w PostgREST', () => {
  it('ma rolę authenticated i czyta własny profil', async () => {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    userId = created.data.user.id;

    const browser = createClient<Database>(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const signedIn = await browser.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
    const token = signedIn.data.session.access_token;
    const claims = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as {
      role: string;
      aud: string;
    };
    expect(claims).toMatchObject({ role: 'authenticated', aud: 'authenticated' });

    const profile = await browser.from('profiles').select('id, plan').single();
    expect(profile.error).toBeNull();
    expect(profile.data).toEqual({ id: userId, plan: 'free' });
  });
});

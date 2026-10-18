/**
 * Testy adwersaryjne kont i tożsamości (Faza 2): profil powstaje dopiero po potwierdzeniu adresu, konto bez
 * profilu nic nie zapisze, pierwszy klient „w planie darmowym” jest dokładnie jeden także przy wyścigu,
 * usunięcie użytkownika kasuje dane kaskadowo, a PostgREST i Supabase Auth odrzucają sfałszowane tokeny,
 * cudze schematy i API administracyjne bez klucza serwisowego.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { ANON_KEY, SUPABASE_URL, signJwt } from '../../scripts/local-supabase/config';
import { admin, anon, clientFor, createUser, deleteUser, sampleReportData, sql, testToken } from './helpers';

const cleanup: string[] = [];

afterAll(async () => {
  await Promise.all(cleanup.map((id) => deleteUser(id)));
});

async function unconfirmedUser(label: string): Promise<{ id: string; email: string }> {
  const email = `${label}-${randomUUID()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: false });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  cleanup.push(data.user.id);
  return { id: data.user.id, email };
}

async function profileCount(id: string): Promise<number> {
  const rows = await sql<{ n: number }>('select count(*)::int as n from public.profiles where id = $1', [id]);
  return rows[0]?.n ?? 0;
}

async function signupEvents(id: string): Promise<number> {
  const rows = await sql<{ n: number }>(
    "select count(*)::int as n from public.events where name = 'signup_completed' and owner_id = $1",
    [id],
  );
  return rows[0]?.n ?? 0;
}

/** Żądanie do PostgREST z dowolnym tokenem (jak przeglądarka z podrobionym nagłówkiem). */
async function rest(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  return { status: response.status, body: await response.text() };
}

describe('profil tylko dla potwierdzonego adresu', () => {
  it('prośba o link logowania tworzy użytkownika bez profilu', async () => {
    const email = `sec-otp-${randomUUID()}@example.com`;
    const { error } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    expect(error).toBeNull();
    const [user] = await sql<{ id: string; email_confirmed_at: Date | null }>(
      'select id, email_confirmed_at from auth.users where email = $1',
      [email],
    );
    expect(user).toBeDefined();
    cleanup.push(user!.id);
    expect(user!.email_confirmed_at).toBeNull();
    expect(await profileCount(user!.id)).toBe(0);
    expect(await signupEvents(user!.id)).toBe(0);
  });

  it('niepotwierdzony użytkownik z tokenem nic nie zapisze (brak profilu)', async () => {
    const pending = await unconfirmedUser('sec-pending');
    const db = clientFor(pending.id);
    const client = await db.from('clients').insert({ name: 'Studio Lumi' });
    expect(client.error?.code).toBe('23503');
    const profile = await db.from('profiles').select('*');
    expect(profile.data).toEqual([]);
    const rows = await sql<{ n: number }>(
      'select count(*)::int as n from public.clients where owner_id = $1',
      [pending.id],
    );
    expect(rows[0]?.n).toBe(0);
  });

  it('token z dowolnym identyfikatorem (bez konta) też nic nie zapisze', async () => {
    const ghost = clientFor(randomUUID());
    const client = await ghost.from('clients').insert({ name: 'Duch' });
    expect(client.error?.code).toBe('23503');
  });

  it('potwierdzenie tworzy profil i jedno zdarzenie signup_completed; kolejne zmiany nie dublują', async () => {
    const pending = await unconfirmedUser('sec-confirm');
    expect(await profileCount(pending.id)).toBe(0);
    const confirmed = await admin.auth.admin.updateUserById(pending.id, { email_confirm: true });
    expect(confirmed.error).toBeNull();
    expect(await profileCount(pending.id)).toBe(1);
    expect(await signupEvents(pending.id)).toBe(1);

    await admin.auth.admin.updateUserById(pending.id, { user_metadata: { plan: 'solo' } });
    await sql('update auth.users set email_confirmed_at = now() where id = $1', [pending.id]);
    expect(await signupEvents(pending.id)).toBe(1);
    const [profile] = await sql('select plan from public.profiles where id = $1', [pending.id]);
    expect(profile?.plan).toBe('free');
  });
});

describe('pierwszy klient w planie darmowym przy wyścigu', () => {
  it('10 równoległych wstawień: wszystkie się udają, dokładnie jeden klient w planie darmowym', async () => {
    const user = await createUser('sec-race');
    cleanup.push(user.id);
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => user.db.from('clients').insert({ name: `Klient ${i + 1}` })),
    );
    for (const { error } of results) expect(error).toBeNull();
    const [row] = await sql<{ n: number; free: number }>(
      'select count(*)::int as n, count(*) filter (where included_in_free)::int as free from public.clients where owner_id = $1',
      [user.id],
    );
    expect(row).toEqual({ n: 10, free: 1 });
  });
});

describe('usunięcie użytkownika', () => {
  it('kasuje dane kaskadowo, link przestaje działać, zdarzenia zostają bez właściciela', async () => {
    const user = await createUser('sec-cascade');
    const client = await user.db.from('clients').insert({ name: 'Fizjo Ruch' }).select('id').single();
    const report = await user.db
      .from('reports')
      .insert({ client_id: client.data!.id, period: '2026-09-01', data: sampleReportData() })
      .select('id')
      .single();
    const token = testToken();
    await user.db.from('share_links').insert({ token, report_id: report.data!.id });
    expect((await anon.rpc('get_shared_report', { p_token: token })).data).not.toBeNull();
    const events = await sql<{ id: string }>('select id::text from public.events where owner_id = $1', [
      user.id,
    ]);
    expect(events.length).toBeGreaterThan(0);

    await deleteUser(user.id);

    for (const [table, column] of [
      ['profiles', 'id'],
      ['clients', 'owner_id'],
      ['reports', 'owner_id'],
      ['share_links', 'owner_id'],
    ] as const) {
      expect(await sql(`select 1 from public.${table} where ${column} = $1`, [user.id]), table).toEqual([]);
    }
    expect((await anon.rpc('get_shared_report', { p_token: token })).data).toBeNull();
    const kept = await sql<{ owner_id: string | null }>(
      'select owner_id from public.events where id = any($1::bigint[])',
      [events.map((e) => e.id)],
    );
    expect(kept).toHaveLength(events.length);
    expect(kept.every((e) => e.owner_id === null)).toBe(true);
  });
});

describe('PostgREST odrzuca sfałszowane i obce tokeny', () => {
  const now = () => Math.floor(Date.now() / 1000);
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

  it('zły sekret, alg „none” i wygasły token: 401', async () => {
    const forged = [
      signJwt({ role: 'service_role', exp: now() + 3600 }, 'nie-ten-sekret-'.repeat(4)),
      `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ role: 'service_role', exp: now() + 3600 })}.`,
      signJwt({ role: 'authenticated', sub: randomUUID(), aud: 'authenticated', exp: now() - 120 }),
    ];
    for (const token of forged) {
      const { status, body } = await rest('/clients?select=*', token);
      expect(status, body).toBe(401);
    }
  });

  it('nawet poprawnie podpisany token nie przejmie roli spoza ról API', async () => {
    for (const role of ['postgres', 'supabase_auth_admin', 'dashboard_user', 'authenticator']) {
      const { status, body } = await rest('/clients?select=*', signJwt({ role, exp: now() + 600 }));
      expect(status, `${role}: ${body}`).toBeGreaterThanOrEqual(401);
      expect(body).not.toContain('owner_id');
    }
  });

  it('schematy inne niż public nie są dostępne', async () => {
    for (const schema of ['auth', 'extensions', 'supabase_migrations', 'pg_catalog']) {
      const read = await rest('/users?select=*', ANON_KEY, { headers: { 'Accept-Profile': schema } });
      expect(read.status, schema).toBe(406);
      const write = await rest('/users', ANON_KEY, {
        method: 'POST',
        headers: { 'Content-Profile': schema },
        body: '{}',
      });
      expect(write.status, schema).toBe(406);
    }
    const catalog = await rest('/pg_authid?select=*', ANON_KEY);
    expect(catalog.status).toBe(404);
  });
});

describe('API administracyjne Supabase Auth tylko z kluczem serwisowym', () => {
  it('klucz anon i token użytkownika: odmowa listy i tworzenia użytkowników', async () => {
    const user = await createUser('sec-admin-api');
    cleanup.push(user.id);
    const userToken = signJwt({
      sub: user.id,
      role: 'authenticated',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    for (const token of [ANON_KEY, userToken]) {
      const list = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
      });
      expect(list.status).toBe(403);
      const create = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `sec-x-${randomUUID()}@example.com`, email_confirm: true }),
      });
      expect(create.status).toBe(403);
    }
  });
});

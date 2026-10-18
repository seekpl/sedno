/**
 * Testy adwersaryjne spójności danych (Faza 2): to, czego aplikacja pilnuje walidacją zod, baza musi
 * wymusić sama, bo zalogowany użytkownik może pominąć aplikację i wołać PostgREST bezpośrednio. Poprawki
 * z migracji 20261013000100_accounts_hardening.sql: ostateczne „Wyłącz link”, nazwy bez dopełniania
 * spacjami i znaków sterujących, skończone daty i zakres miesięcy, logo tylko we własnym katalogu, limity
 * na konto.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DB_URL } from '../../scripts/local-supabase/config';
import {
  admin,
  anon,
  createUser,
  deleteUser,
  sampleReportData,
  sql,
  testToken,
  type TestUser,
} from './helpers';

let user: TestUser;
let other: TestUser;
let clientId: string;
let reportId: string;

beforeAll(async () => {
  [user, other] = await Promise.all([createUser('sec-integrity'), createUser('sec-integrity-o')]);
  const client = await user.db.from('clients').insert({ name: 'Studio Lumi' }).select('id').single();
  if (client.error) throw client.error;
  clientId = client.data.id;
  const report = await user.db
    .from('reports')
    .insert({ client_id: clientId, period: '2026-09-01', data: sampleReportData() })
    .select('id')
    .single();
  if (report.error) throw report.error;
  reportId = report.data.id;
});

afterAll(async () => {
  await Promise.all([deleteUser(user.id), deleteUser(other.id)]);
});

async function newLink(): Promise<string> {
  const token = testToken();
  const { error } = await user.db.from('share_links').insert({ token, report_id: reportId });
  if (error) throw error;
  return token;
}

describe('kolumny ustawiane tylko przez bazę albo serwer', () => {
  it('link: termin ważności, licznik, daty i odwołanie nie do podania przy wstawianiu', async () => {
    const future = new Date(Date.now() + 10 * 365 * 864e5).toISOString();
    const extras = [
      { expires_at: future },
      { views: 1000 },
      { created_at: '2020-01-01T00:00:00Z' },
      { revoked_at: new Date().toISOString() },
    ];
    for (const extra of extras) {
      const { error } = await user.db
        .from('share_links')
        .insert({ token: testToken(), report_id: reportId, ...extra } as never);
      expect(error?.code, JSON.stringify(extra)).toBe('42501');
    }
  });

  it('link: termin ważności, licznik i data utworzenia nie do zmiany', async () => {
    const token = await newLink();
    const changes = [
      { expires_at: new Date(Date.now() + 10 * 365 * 864e5).toISOString() },
      { views: 0 },
      { created_at: new Date().toISOString() },
    ];
    for (const change of changes) {
      const { error } = await user.db
        .from('share_links')
        .update(change as never)
        .eq('token', token);
      expect(error?.code, JSON.stringify(change)).toBe('42501');
    }
  });

  it('raport: odblokowanie i daty techniczne nie do podania ani zmiany', async () => {
    const insert = await user.db
      .from('reports')
      .insert({ client_id: clientId, period: '2026-01-01', data: {}, unlocked: true } as never);
    expect(insert.error?.code).toBe('42501');
    for (const change of [
      { updated_at: '2020-01-01T00:00:00Z' },
      { created_at: '2020-01-01T00:00:00Z' },
      { unlocked: true },
    ]) {
      const { error } = await user.db
        .from('reports')
        .update(change as never)
        .eq('id', reportId);
      expect(error?.code, JSON.stringify(change)).toBe('42501');
    }
  });

  it('klient i profil: flagi planu, daty i dane rozliczeń nie do podania ani zmiany', async () => {
    for (const extra of [
      { included_in_free: false },
      { created_at: '2020-01-01T00:00:00Z' },
      { archived_at: null },
    ]) {
      const { error } = await user.db.from('clients').insert({ name: 'X', ...extra } as never);
      expect(error?.code, JSON.stringify(extra)).toBe('42501');
    }
    for (const change of [
      { plan_renews_at: '2099-01-01T00:00:00Z' },
      { stripe_customer_id: 'cus_x' },
      { created_at: '2020-01-01T00:00:00Z' },
    ]) {
      const { error } = await user.db
        .from('profiles')
        .update(change as never)
        .eq('id', user.id);
      expect(error?.code, JSON.stringify(change)).toBe('42501');
    }
    const insertProfile = await user.db.from('profiles').insert({ id: user.id } as never);
    expect(insertProfile.error?.code).toBe('42501');
  });
});

describe('„Wyłącz link” jest ostateczne', () => {
  it('wyłączonego linku nie da się włączyć z powrotem', async () => {
    const token = await newLink();
    const revoked = await user.db
      .from('share_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token', token)
      .select('revoked_at');
    expect(revoked.data?.[0]?.revoked_at).not.toBeNull();

    const reopened = await user.db
      .from('share_links')
      .update({ revoked_at: null })
      .eq('token', token)
      .select();
    expect(reopened.error?.code).toBe('42501');
    const [row] = await sql('select revoked_at from public.share_links where token = $1', [token]);
    expect(row?.revoked_at).not.toBeNull();
    const shared = await anon.rpc('get_shared_report', { p_token: token });
    expect(shared.data).toBeNull();
  });

  it('chwili wyłączenia nie da się przesunąć; ustawia ją baza', async () => {
    const token = await newLink();
    const farFuture = '2999-01-01T00:00:00Z';
    const revoked = await user.db
      .from('share_links')
      .update({ revoked_at: farFuture })
      .eq('token', token)
      .select('revoked_at')
      .single();
    expect(revoked.error).toBeNull();
    expect(Math.abs(new Date(revoked.data!.revoked_at!).getTime() - Date.now())).toBeLessThan(60_000);

    const moved = await user.db.from('share_links').update({ revoked_at: farFuture }).eq('token', token);
    expect(moved.error?.code).toBe('42501');
  });

  it('obowiązuje też klucz serwisowy', async () => {
    const token = await newLink();
    await user.db.from('share_links').update({ revoked_at: new Date().toISOString() }).eq('token', token);
    const reopened = await admin.from('share_links').update({ revoked_at: null }).eq('token', token);
    expect(reopened.error).not.toBeNull();
    const [row] = await sql('select revoked_at from public.share_links where token = $1', [token]);
    expect(row?.revoked_at).not.toBeNull();
  });
});

describe('status i data wysłania', () => {
  it('„Wysłany” wymaga daty wysłania, a inne statusy jej nie mają', async () => {
    const attempts = [
      user.db.from('reports').insert({ client_id: clientId, period: '2026-02-01', data: {}, status: 'sent' }),
      user.db.from('reports').insert({
        client_id: clientId,
        period: '2026-02-01',
        data: {},
        status: 'draft',
        sent_at: new Date().toISOString(),
      }),
      user.db.from('reports').update({ status: 'sent' }).eq('id', reportId),
      user.db.from('reports').update({ sent_at: new Date().toISOString() }).eq('id', reportId),
    ];
    for (const { error } of await Promise.all(attempts)) expect(error?.code).toBe('23514');
  });

  it('data wysłania musi być skończona', async () => {
    for (const sentAt of ['infinity', '-infinity']) {
      const { error } = await user.db
        .from('reports')
        .update({ status: 'sent', sent_at: sentAt })
        .eq('id', reportId);
      expect(error?.code, sentAt).toBe('23514');
    }
    const [row] = await sql('select status from public.reports where id = $1', [reportId]);
    expect(row?.status).toBe('draft');
  });

  it('data archiwizacji klienta musi być skończona', async () => {
    const { error } = await user.db.from('clients').update({ archived_at: 'infinity' }).eq('id', clientId);
    expect(error?.code).toBe('23514');
  });
});

describe('miesiąc raportu', () => {
  it('tylko pierwszy dzień miesiąca', async () => {
    const { error } = await user.db
      .from('reports')
      .insert({ client_id: clientId, period: '2026-08-15', data: {} });
    expect(error?.code).toBe('23514');
  });

  it('„infinity” i lata poza 2000–2099 są odrzucane', async () => {
    for (const period of ['infinity', '-infinity', '1999-12-01', '2100-01-01', '0001-01-01']) {
      const { error } = await user.db.from('reports').insert({ client_id: clientId, period, data: {} });
      expect(error?.code, period).toBe('23514');
    }
  });

  it('granice zakresu są dozwolone', async () => {
    for (const period of ['2000-01-01', '2099-12-01']) {
      const { error } = await user.db.from('reports').insert({ client_id: clientId, period, data: {} });
      expect(error, period).toBeNull();
    }
  });
});

describe('dane raportu', () => {
  it('tylko obiekt JSON', async () => {
    for (const data of [[1, 2], 'tekst', 42, null]) {
      const { error } = await user.db
        .from('reports')
        .insert({ client_id: clientId, period: '2025-01-01', data: data as never });
      expect(error, JSON.stringify(data)).not.toBeNull();
    }
  });

  it('najwyżej 64 KB — przy wstawianiu i przy zmianie', async () => {
    const big = { ...sampleReportData(), comment: 'x'.repeat(70_000) };
    const insert = await user.db
      .from('reports')
      .insert({ client_id: clientId, period: '2025-02-01', data: big });
    expect(insert.error?.code).toBe('23514');
    const update = await user.db.from('reports').update({ data: big }).eq('id', reportId);
    expect(update.error?.code).toBe('23514');
  });
});

describe('nazwy', () => {
  it('nazwa klienta: limit 80 znaków liczony na całym tekście, także ze spacjami', async () => {
    for (const name of ['a' + ' '.repeat(100_000), ' '.repeat(81) + 'a', 'a'.repeat(81), '', '   ']) {
      const { error } = await user.db.from('clients').insert({ name });
      expect(error?.code, `${name.length} znaków`).toBe('23514');
    }
    const ok = await user.db
      .from('clients')
      .insert({ name: 'Zakład Fryzjerski „Ździebko” — Łódź'.padEnd(80, '.') })
      .select('name')
      .single();
    expect(ok.error).toBeNull();
  });

  it('bez znaków sterujących w nazwie klienta i w profilu', async () => {
    for (const name of [
      'Studio\nLumi',
      'Studio\u0007',
      'Studio\u001b[31m',
      'Studio\u0085Lumi',
      'Studio\tLumi',
    ]) {
      const { error } = await user.db.from('clients').insert({ name });
      expect(error?.code, JSON.stringify(name)).toBe('23514');
    }
    for (const change of [{ display_name: 'Ania\r\nKowalska' }, { brand_name: 'Kadr\u0008Social' }]) {
      const { error } = await user.db.from('profiles').update(change).eq('id', user.id);
      expect(error?.code, JSON.stringify(change)).toBe('23514');
    }
    const ok = await user.db
      .from('profiles')
      .update({ display_name: 'Anna Kowalska', brand_name: 'Kadr Social' })
      .eq('id', user.id)
      .select('brand_name')
      .single();
    expect(ok.data?.brand_name).toBe('Kadr Social');
  });
});

describe('logo tylko we własnym katalogu zasobnika', () => {
  it('nawet klucz serwisowy nie podepnie cudzego pliku pod profil', async () => {
    const foreign = await admin
      .from('profiles')
      .update({ logo_path: `${other.id}/logo.png` } as never)
      .eq('id', user.id);
    expect(foreign.error?.code).toBe('23514');
    const own = await admin
      .from('profiles')
      .update({ logo_path: `${user.id}/logo.png` } as never)
      .eq('id', user.id);
    expect(own.error).toBeNull();
    await admin
      .from('profiles')
      .update({ logo_path: null } as never)
      .eq('id', user.id);
  });
});

describe('limity na konto', () => {
  it('najwyżej 500 klientów (także przy wstawianiu wielu naraz)', async () => {
    const owner = await createUser('sec-quota-c');
    try {
      const batch = Array.from({ length: 500 }, (_, i) => ({ name: `Klient ${i + 1}` }));
      const first = await owner.db.from('clients').insert(batch);
      expect(first.error).toBeNull();
      const over = await owner.db.from('clients').insert({ name: 'Klient 501' });
      expect(over.error?.code).toBe('23514');
      const [row] = await sql<{ n: number; free: number }>(
        'select count(*)::int as n, count(*) filter (where included_in_free)::int as free from public.clients where owner_id = $1',
        [owner.id],
      );
      expect(row).toEqual({ n: 500, free: 1 });
    } finally {
      await deleteUser(owner.id);
    }
  });

  it('najwyżej 100 linków do jednego raportu', async () => {
    const batch = Array.from({ length: 100 }, () => ({ token: testToken(), report_id: reportId }));
    const existing = await sql<{ n: number }>(
      'select count(*)::int as n from public.share_links where report_id = $1',
      [reportId],
    );
    const first = await user.db.from('share_links').insert(batch.slice(existing[0]!.n));
    expect(first.error).toBeNull();
    const over = await user.db.from('share_links').insert({ token: testToken(), report_id: reportId });
    expect(over.error?.code).toBe('23514');
  });

  it('najwyżej 10 000 raportów na konto', async () => {
    const owner = await createUser('sec-quota-r');
    try {
      const clients = await owner.db
        .from('clients')
        .insert(Array.from({ length: 10 }, (_, i) => ({ name: `Klient ${i + 1}` })))
        .select('id');
      if (clients.error) throw clients.error;
      // 10 000 raportów wstawiamy z pominięciem triggerów (szybciej); spójność kluczy zapewnia zapytanie.
      const db = new pg.Client({ connectionString: DB_URL });
      await db.connect();
      try {
        await db.query('set session_replication_role = replica');
        await db.query(
          `insert into public.reports (owner_id, client_id, period, data)
           select $1, c.id, date '2000-01-01' + make_interval(months => g), '{}'::jsonb
             from unnest($2::uuid[]) as c(id)
            cross join generate_series(0, 1199) as g
            limit 10000`,
          [owner.id, clients.data.slice(0, 9).map((c) => c.id)],
        );
      } finally {
        await db.end();
      }
      const over = await owner.db
        .from('reports')
        .insert({ client_id: clients.data[9]!.id, period: '2026-09-01', data: sampleReportData() });
      expect(over.error?.code).toBe('23514');
    } finally {
      await deleteUser(owner.id);
    }
  });
});

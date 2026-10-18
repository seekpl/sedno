/**
 * Testy adwersaryjne publicznego wejścia do bazy (Faza 2): get_shared_report to jedyna funkcja dostępna dla
 * klucza anon. Dziwne tokeny, odwołane i przeterminowane linki, licznik bez przepełnienia, wynik bez
 * identyfikatorów i ścieżki logo. Do tego: zdarzenia i lista oczekujących poza zasięgiem ról API, a funkcje
 * triggerów nie do wywołania przez RPC.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

let owner: TestUser;
let reportId: string;
let token: string;

async function views(t: string): Promise<number | undefined> {
  const [row] = await sql<{ views: number }>('select views from public.share_links where token = $1', [t]);
  return row?.views;
}

async function newLink(): Promise<string> {
  const t = testToken();
  const { error } = await owner.db.from('share_links').insert({ token: t, report_id: reportId });
  if (error) throw error;
  return t;
}

beforeAll(async () => {
  owner = await createUser('sec-shared');
  const client = await owner.db.from('clients').insert({ name: 'Studio Lumi' }).select('id').single();
  if (client.error) throw client.error;
  const report = await owner.db
    .from('reports')
    .insert({ client_id: client.data.id, period: '2026-09-01', data: sampleReportData() })
    .select('id')
    .single();
  if (report.error) throw report.error;
  reportId = report.data.id;
  token = await newLink();
});

afterAll(async () => {
  await deleteUser(owner.id);
});

describe('get_shared_report: wejście', () => {
  it('dziwne tokeny zwracają null bez błędu i bez wyświetlenia', async () => {
    const odd = [
      '',
      ' ',
      token.slice(0, 21),
      `${token}A`,
      ` ${token}`,
      `${token.slice(0, 21)}%`,
      '%'.repeat(22),
      '_'.repeat(22),
      `${token.slice(0, 21)}ą`,
      `${token.slice(0, 11)}' or '1'='1`.slice(0, 22),
      "' or 1=1 --",
      token.toLowerCase() === token ? token.toUpperCase() : token.toLowerCase(),
      'A'.repeat(10_000),
      `${token}\n`,
    ];
    for (const value of odd) {
      const { data, error } = await anon.rpc('get_shared_report', { p_token: value });
      expect(error, JSON.stringify(value)).toBeNull();
      expect(data, JSON.stringify(value)).toBeNull();
    }
    const nullToken = await anon.rpc('get_shared_report', { p_token: null as never });
    expect(nullToken.data).toBeNull();
    expect(await views(token)).toBe(0);
  });

  it('odwołany i przeterminowany link: null i licznik bez zmian', async () => {
    const revoked = await newLink();
    await owner.db.from('share_links').update({ revoked_at: new Date().toISOString() }).eq('token', revoked);
    const expired = await newLink();
    await sql("update public.share_links set expires_at = now() - interval '1 second' where token = $1", [
      expired,
    ]);
    for (const t of [revoked, expired]) {
      for (const client of [anon, owner.db]) {
        const { data, error } = await client.rpc('get_shared_report', { p_token: t });
        expect(error).toBeNull();
        expect(data).toBeNull();
      }
      expect(await views(t)).toBe(0);
    }
  });
});

describe('get_shared_report: wynik', () => {
  it('tylko data, branding i hasLogo — bez identyfikatorów, e-maila i ścieżki logo', async () => {
    await admin
      .from('profiles')
      .update({ logo_path: `${owner.id}/logo.png` } as never)
      .eq('id', owner.id);
    try {
      const { data } = await anon.rpc('get_shared_report', { p_token: token });
      const result = data as { hasLogo: boolean } | null;
      expect(Object.keys(result ?? {}).sort()).toEqual(['branding', 'data', 'hasLogo']);
      expect(result?.hasLogo).toBe(true);
      const text = JSON.stringify(result);
      for (const secret of [owner.id, owner.email, reportId, token, 'logo.png']) {
        expect(text).not.toContain(secret);
      }
    } finally {
      await admin
        .from('profiles')
        .update({ logo_path: null } as never)
        .eq('id', owner.id);
    }
  });

  it('licznik wyświetleń zatrzymuje się na maksimum zamiast psuć link', async () => {
    const t = await newLink();
    await sql('update public.share_links set views = 2147483647 where token = $1', [t]);
    const { data, error } = await anon.rpc('get_shared_report', { p_token: t });
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(await views(t)).toBe(2147483647);
  });

  it('użytkownik nie ustawi licznika sam', async () => {
    const { error } = await owner.db
      .from('share_links')
      .update({ views: 0 } as never)
      .eq('token', token);
    expect(error?.code).toBe('42501');
  });
});

describe('zdarzenia i lista oczekujących poza zasięgiem ról API', () => {
  it('anon i zalogowany: bez odczytu, zapisu, zmiany i usunięcia', async () => {
    const marker = `sec-${testToken()}`;
    for (const db of [anon, owner.db]) {
      for (const table of ['events', 'waitlist'] as const) {
        const read = await db.from(table).select('*').limit(1);
        expect(read.data ?? [], table).toEqual([]);
        const row =
          table === 'events'
            ? { name: marker, props: {} }
            : { email: `${marker}@example.com`, plan: 'studio', consent_at: new Date().toISOString() };
        const insert = await db.from(table).insert(row as never);
        expect(insert.error?.code, table).toBe('42501');
        const update = await db
          .from(table)
          .update({ created_at: new Date().toISOString() } as never)
          .neq('created_at', '1970-01-01');
        expect(update.error?.code, table).toBe('42501');
        const remove = await db.from(table).delete().neq('created_at', '1970-01-01');
        expect(remove.error?.code, table).toBe('42501');
      }
    }
    const rows = await sql<{ n: number }>(
      'select (select count(*) from public.events where name = $1) + (select count(*) from public.waitlist where email = $2) as n',
      [marker, `${marker}@example.com`],
    );
    expect(Number(rows[0]?.n)).toBe(0);
  });

  it('zalogowany nie odczyta zdarzeń przez osadzenie w swoim profilu', async () => {
    const { data, error } = await owner.db.from('profiles').select('id, events(*)');
    expect(error?.code).toBe('42501');
    expect(data).toBeNull();
  });
});

describe('RPC: tylko get_shared_report', () => {
  it('funkcje triggerów nie są dostępne dla anon ani zalogowanego', async () => {
    const functions = [
      'handle_user_confirmed',
      'clients_set_included_in_free',
      'touch_updated_at',
      'share_links_revoke_is_final',
      'clients_enforce_quota',
      'reports_enforce_quota',
      'share_links_enforce_quota',
    ];
    for (const db of [anon, owner.db]) {
      for (const fn of functions) {
        const { data, error } = await db.rpc(fn as never);
        expect(error, fn).not.toBeNull();
        expect(data, fn).toBeNull();
      }
    }
  });
});

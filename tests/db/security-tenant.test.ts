/**
 * Testy adwersaryjne izolacji kont (Faza 2): złośliwa zalogowana przeglądarka zna swój token dostępu i woła
 * PostgREST bezpośrednio — z filtrami, osadzonymi zasobami, upsertem i kolumnami spoza formularzy. Uzupełnia
 * tests/db/rls.test.ts (podstawowe kryterium akceptacji) o wektory, które mogłyby ominąć RLS albo zdradzić
 * istnienie cudzych danych.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUser, deleteUser, sampleReportData, sql, testToken, type TestUser } from './helpers';

type Fixture = { user: TestUser; clientId: string; reportId: string; token: string };

let alice: Fixture;
let bob: Fixture;

async function fixture(label: string, name: string): Promise<Fixture> {
  const user = await createUser(label);
  const client = await user.db.from('clients').insert({ name }).select('id').single();
  if (client.error) throw client.error;
  const report = await user.db
    .from('reports')
    .insert({ client_id: client.data.id, period: '2026-09-01', data: sampleReportData('2026-09', name) })
    .select('id')
    .single();
  if (report.error) throw report.error;
  const token = testToken();
  const link = await user.db.from('share_links').insert({ token, report_id: report.data.id });
  if (link.error) throw link.error;
  return { user, clientId: client.data.id, reportId: report.data.id, token };
}

/** Identyfikatory i token Alicji nie mogą pojawić się w żadnej odpowiedzi dla Boba. */
function expectNoAliceData(value: unknown) {
  const text = JSON.stringify(value ?? null);
  for (const secret of [alice.user.id, alice.clientId, alice.reportId, alice.token, 'Studio Lumi']) {
    expect(text).not.toContain(secret);
  }
}

beforeAll(async () => {
  [alice, bob] = await Promise.all([
    fixture('sec-tenant-a', 'Studio Lumi'),
    fixture('sec-tenant-b', 'Kawiarnia Bob'),
  ]);
});

afterAll(async () => {
  await Promise.all([deleteUser(alice.user.id), deleteUser(bob.user.id)]);
});

describe('odczyt: filtry i osadzone zasoby nie omijają RLS', () => {
  it('osadzenie w dół (klient → raporty → linki) pokazuje tylko własne wiersze', async () => {
    const { data, error } = await bob.user.db
      .from('clients')
      .select('id, name, reports(id, period, share_links(token, views))');
    expect(error).toBeNull();
    expect(data).toEqual([
      {
        id: bob.clientId,
        name: 'Kawiarnia Bob',
        reports: [{ id: bob.reportId, period: '2026-09-01', share_links: [{ token: bob.token, views: 0 }] }],
      },
    ]);
    expectNoAliceData(data);
  });

  it('osadzenie w górę i filtry po cudzych identyfikatorach dają puste listy', async () => {
    const db = bob.user.db;
    const queries = [
      db.from('reports').select('*, clients(*), share_links(*)').eq('client_id', alice.clientId),
      db.from('reports').select('*').eq('owner_id', alice.user.id),
      db.from('share_links').select('*, reports(*, clients(*))').eq('token', alice.token),
      db.from('share_links').select('*').eq('report_id', alice.reportId),
      db.from('clients').select('*').or(`id.eq.${alice.clientId},owner_id.eq.${alice.user.id}`),
      db.from('profiles').select('*, clients(*)').eq('id', alice.user.id),
      db.from('reports').select('*').in('id', [alice.reportId]),
    ];
    for (const { data, error } of await Promise.all(queries)) {
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  it('profil z osadzonymi klientami i liczniki widzą tylko własne konto', async () => {
    const profile = await bob.user.db
      .from('profiles')
      .select('id, clients(id), reports(id), share_links(token)');
    expect(profile.data).toEqual([
      {
        id: bob.user.id,
        clients: [{ id: bob.clientId }],
        reports: [{ id: bob.reportId }],
        share_links: [{ token: bob.token }],
      },
    ]);
    const counted = await bob.user.db
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', alice.user.id);
    expect(counted.count).toBe(0);
    const all = await bob.user.db.from('share_links').select('*', { count: 'exact', head: true });
    expect(all.count).toBe(1);
  });
});

describe('zapis: brak wyroczni istnienia cudzych raportów', () => {
  it('raport przy cudzym kliencie: ten sam błąd, czy właściciel ma raport za ten miesiąc, czy nie', async () => {
    const existing = await bob.user.db
      .from('reports')
      .insert({ client_id: alice.clientId, period: '2026-09-01', data: sampleReportData() });
    const missing = await bob.user.db
      .from('reports')
      .insert({ client_id: alice.clientId, period: '2026-03-01', data: sampleReportData('2026-03') });
    expect(existing.error?.code).toBe('23503');
    expect(missing.error?.code).toBe('23503');
    expect(existing.status).toBe(missing.status);
    expectNoAliceData(existing.error);
  });

  it('upsert z ignore-duplicates nie odróżnia istniejącego cudzego raportu od brakującego', async () => {
    for (const onConflict of ['client_id,period', 'owner_id,client_id,period']) {
      const existing = await bob.user.db
        .from('reports')
        .upsert(
          { client_id: alice.clientId, period: '2026-09-01', data: sampleReportData() },
          { onConflict, ignoreDuplicates: true },
        )
        .select('id');
      const missing = await bob.user.db
        .from('reports')
        .upsert(
          { client_id: alice.clientId, period: '2026-04-01', data: sampleReportData('2026-04') },
          { onConflict, ignoreDuplicates: true },
        )
        .select('id');
      expect(existing.error, onConflict).not.toBeNull();
      expect(existing.status, onConflict).toBe(missing.status);
      expect(existing.error?.code, onConflict).toBe(missing.error?.code);
    }
  });

  it('upsert z łączeniem nie nadpisuje cudzego raportu ani linku', async () => {
    const report = await bob.user.db
      .from('reports')
      .upsert(
        { client_id: alice.clientId, period: '2026-09-01', data: sampleReportData('2026-09', 'Przejęty') },
        { onConflict: 'client_id,period' },
      )
      .select('id');
    expect(report.error).not.toBeNull();
    const link = await bob.user.db
      .from('share_links')
      .upsert({ token: alice.token, report_id: bob.reportId }, { onConflict: 'token' })
      .select('token');
    expect(link.error).not.toBeNull();
    const [row] = await sql(
      'select l.report_id, l.revoked_at, r.data->>$2 as headline from public.share_links l join public.reports r on r.id = l.report_id where l.token = $1',
      [alice.token, 'headline'],
    );
    expect(row).toEqual({
      report_id: alice.reportId,
      revoked_at: null,
      headline: '23 osoby chciały się umówić',
    });
  });

  it('własny raport za ten sam miesiąc nadal jest odrzucany jako duplikat', async () => {
    const duplicate = await alice.user.db
      .from('reports')
      .insert({ client_id: alice.clientId, period: '2026-09-01', data: sampleReportData() });
    expect(duplicate.error?.code).toBe('23505');
  });

  it('link do cudzego raportu jest odrzucany kluczem obcym z właścicielem', async () => {
    const link = await bob.user.db
      .from('share_links')
      .insert({ token: testToken(), report_id: alice.reportId });
    expect(link.error?.code).toBe('23503');
    expectNoAliceData(link.error);
  });
});

describe('zapis: kolumny tożsamości i własności', () => {
  it('owner_id nie da się podać przy wstawianiu — nawet własnego', async () => {
    const own = bob.user.id;
    const attempts = [
      bob.user.db.from('clients').insert({ name: 'X', owner_id: own } as never),
      bob.user.db.from('clients').insert({ name: 'X', owner_id: alice.user.id } as never),
      bob.user.db
        .from('reports')
        .insert({ client_id: bob.clientId, period: '2026-01-01', data: {}, owner_id: own } as never),
      bob.user.db
        .from('share_links')
        .insert({ token: testToken(), report_id: bob.reportId, owner_id: own } as never),
    ];
    for (const { error } of await Promise.all(attempts)) expect(error?.code).toBe('42501');
  });

  it('identyfikatora wiersza nie da się wybrać przy wstawianiu', async () => {
    const client = await bob.user.db.from('clients').insert({ name: 'X', id: alice.clientId } as never);
    expect(client.error?.code).toBe('42501');
    const report = await bob.user.db
      .from('reports')
      .insert({ id: crypto.randomUUID(), client_id: bob.clientId, period: '2026-01-01', data: {} } as never);
    expect(report.error?.code).toBe('42501');
  });

  it('własnego wiersza nie da się przepisać na inne konto ani przenieść', async () => {
    const attempts = [
      bob.user.db
        .from('clients')
        .update({ owner_id: alice.user.id } as never)
        .eq('id', bob.clientId),
      bob.user.db
        .from('reports')
        .update({ owner_id: alice.user.id } as never)
        .eq('id', bob.reportId),
      bob.user.db
        .from('reports')
        .update({ client_id: alice.clientId } as never)
        .eq('id', bob.reportId),
      bob.user.db
        .from('reports')
        .update({ period: '2026-01-01' } as never)
        .eq('id', bob.reportId),
      bob.user.db
        .from('share_links')
        .update({ owner_id: alice.user.id } as never)
        .eq('token', bob.token),
      bob.user.db
        .from('share_links')
        .update({ report_id: alice.reportId } as never)
        .eq('token', bob.token),
      bob.user.db
        .from('share_links')
        .update({ token: testToken() } as never)
        .eq('token', bob.token),
      bob.user.db
        .from('profiles')
        .update({ id: alice.user.id } as never)
        .eq('id', bob.user.id),
    ];
    for (const { error } of await Promise.all(attempts)) expect(error?.code).toBe('42501');
    const [link] = await sql('select owner_id, report_id from public.share_links where token = $1', [
      bob.token,
    ]);
    expect(link).toEqual({ owner_id: bob.user.id, report_id: bob.reportId });
  });

  it('usuwanie wierszy przez API jest zablokowane — także własnych', async () => {
    const attempts = [
      bob.user.db.from('clients').delete().eq('id', bob.clientId),
      bob.user.db.from('clients').delete().eq('id', alice.clientId),
      bob.user.db.from('reports').delete().eq('id', bob.reportId),
      bob.user.db.from('share_links').delete().eq('token', alice.token),
      bob.user.db.from('profiles').delete().eq('id', bob.user.id),
    ];
    for (const { error } of await Promise.all(attempts)) expect(error?.code).toBe('42501');
    const rows = await sql<{ n: number }>(
      'select (select count(*) from public.clients where id = any($1))::int as n',
      [[alice.clientId, bob.clientId]],
    );
    expect(rows[0]?.n).toBe(2);
  });

  it('zmiana cudzych wierszy nie trafia w nic', async () => {
    const results = await Promise.all([
      bob.user.db
        .from('clients')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', alice.clientId)
        .select(),
      bob.user.db
        .from('reports')
        .update({ data: sampleReportData('2026-09', 'X') })
        .eq('id', alice.reportId)
        .select(),
      bob.user.db.from('profiles').update({ brand_name: 'Przejęte' }).eq('id', alice.user.id).select(),
    ]);
    for (const { data, error } of results) {
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
    const [client] = await sql('select archived_at from public.clients where id = $1', [alice.clientId]);
    expect(client?.archived_at).toBeNull();
  });
});

/**
 * Dane panelu klientów (lib/data/panel.ts) na lokalnym stosie Supabase, przez PostgREST jako zalogowany
 * użytkownik (RLS): tylko własni klienci, bez zarchiwizowanych, kolejność dodania, status i liczby
 * z raportu za M, sumy „Zarezerwuj” za M i M−1, dane w złym kształcie to brak danych. Dodawanie klienta:
 * walidacja i „klient w planie darmowym” ustawiany wyłącznie przez bazę.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { anon, createUser, deleteUser, sampleReportData, sql, type TestUser } from './helpers';

vi.mock('server-only', () => ({}));

const { createClient, currentPlan, monthOverview, PanelDataError } = await import('@/lib/data/panel');
type ClientInput = import('@/lib/data/panel').ClientInput;

let alice: TestUser;
let bob: TestUser;
let carol: TestUser;
const ids: Record<string, string> = {};

function reportData(
  period: string,
  client: string,
  numbers: { book: number | null; call: number | null; views: number | null },
) {
  const base = sampleReportData(period, client);
  return {
    ...base,
    actions: { ...base.actions, book: numbers.book, call: numbers.call },
    summary: { ...base.summary, views: numbers.views },
  };
}

async function addClient(user: TestUser, key: string, name: string, createdAt: string) {
  const { data, error } = await user.db.from('clients').insert({ name }).select('id').single();
  if (error) throw error;
  ids[key] = data.id;
  // Stała kolejność dodania niezależnie od tempa testu (created_at ustawia tylko baza).
  await sql('update public.clients set created_at = $1 where id = $2', [createdAt, data.id]);
}

async function addReport(
  user: TestUser,
  client: string,
  month: string,
  status: 'draft' | 'ready' | 'sent',
  data: object,
) {
  const { error } = await user.db.from('reports').insert({
    client_id: ids[client]!,
    period: `${month}-01`,
    status,
    sent_at: status === 'sent' ? `${month}-28T10:00:00Z` : null,
    data: data as never,
  });
  if (error) throw error;
}

beforeAll(async () => {
  [alice, bob, carol] = await Promise.all([
    createUser('panel-a'),
    createUser('panel-b'),
    createUser('panel-c'),
  ]);

  // Kolejność dodania: Lumi, Bistro, Fizjo, Archiwalny, Kwiaciarnia (wstawiane w innej kolejności).
  await addClient(alice, 'kwiaciarnia', 'Kwiaciarnia Pąk', '2026-01-05T10:00:00Z');
  await addClient(alice, 'lumi', 'Studio Lumi', '2026-01-01T10:00:00Z');
  await addClient(alice, 'fizjo', 'Fizjo Ruch', '2026-01-03T10:00:00Z');
  await addClient(alice, 'bistro', 'Bistro Pod Lipą', '2026-01-02T10:00:00Z');
  await addClient(alice, 'archiwalny', 'Archiwalny', '2026-01-04T10:00:00Z');
  await addClient(bob, 'cudzy', 'Klient Boba', '2026-01-01T09:00:00Z');

  await addReport(
    alice,
    'lumi',
    '2026-09',
    'sent',
    reportData('2026-09', 'Studio Lumi', { book: 23, call: 9, views: 12480 }),
  );
  await addReport(
    alice,
    'bistro',
    '2026-09',
    'ready',
    reportData('2026-09', 'Bistro Pod Lipą', { book: 41, call: 17, views: 8320 }),
  );
  // Szkic w innym kształcie niż ReportData: status zostaje, liczby to brak danych.
  await addReport(alice, 'fizjo', '2026-09', 'draft', { draft: true, actions: { book: 6 } });
  await addReport(
    alice,
    'archiwalny',
    '2026-09',
    'sent',
    reportData('2026-09', 'Archiwalny', { book: 100, call: 1, views: 1 }),
  );

  await addReport(
    alice,
    'lumi',
    '2026-08',
    'sent',
    reportData('2026-08', 'Studio Lumi', { book: 30, call: 2, views: 900 }),
  );
  await addReport(
    alice,
    'bistro',
    '2026-08',
    'draft',
    reportData('2026-08', 'Bistro Pod Lipą', { book: null, call: 4, views: null }),
  );
  await addReport(alice, 'fizjo', '2026-08', 'draft', { niepoprawne: true });
  await addReport(
    alice,
    'archiwalny',
    '2026-08',
    'sent',
    reportData('2026-08', 'Archiwalny', { book: 500, call: 1, views: 1 }),
  );
  await addReport(
    alice,
    'lumi',
    '2026-07',
    'sent',
    reportData('2026-07', 'Studio Lumi', { book: 7, call: 0, views: 100 }),
  );

  await addReport(
    bob,
    'cudzy',
    '2026-09',
    'sent',
    reportData('2026-09', 'Klient Boba', { book: 999, call: 999, views: 999 }),
  );
  await addReport(
    bob,
    'cudzy',
    '2026-08',
    'sent',
    reportData('2026-08', 'Klient Boba', { book: 888, call: 1, views: 1 }),
  );

  const archived = await alice.db
    .from('clients')
    .update({ archived_at: '2026-10-01T10:00:00Z' })
    .eq('id', ids.archiwalny!);
  if (archived.error) throw archived.error;
});

afterAll(async () => {
  await Promise.all([deleteUser(alice.id), deleteUser(bob.id), deleteUser(carol.id)]);
});

describe('monthOverview', () => {
  it('własni aktywni klienci w kolejności dodania, status i liczby z raportu za M', async () => {
    const overview = await monthOverview(alice.db, '2026-09');
    expect(overview.rows).toEqual([
      { id: ids.lumi, name: 'Studio Lumi', status: 'sent', book: 23, call: 9, views: 12480 },
      { id: ids.bistro, name: 'Bistro Pod Lipą', status: 'ready', book: 41, call: 17, views: 8320 },
      { id: ids.fizjo, name: 'Fizjo Ruch', status: 'draft', book: null, call: null, views: null },
      {
        id: ids.kwiaciarnia,
        name: 'Kwiaciarnia Pąk',
        status: 'no-export',
        book: null,
        call: null,
        views: null,
      },
    ]);
    expect(overview.sentCount).toBe(1);
    expect(overview.total).toBe(4);
  });

  it('sumy „Zarezerwuj” za M i M−1 bez zarchiwizowanych i bez cudzych raportów', async () => {
    const overview = await monthOverview(alice.db, '2026-09');
    expect(overview.bookSum).toBe(23 + 41);
    // Sierpień: Lumi 30, Bistro bez liczby, Fizjo w złym kształcie, Archiwalny pominięty.
    expect(overview.bookSumPrevious).toBe(30);
  });

  it('inny miesiąc: status z raportu tego miesiąca, M−1 przesunięte', async () => {
    const august = await monthOverview(alice.db, '2026-08');
    expect(august.rows.map((r) => [r.name, r.status, r.book])).toEqual([
      ['Studio Lumi', 'sent', 30],
      ['Bistro Pod Lipą', 'draft', null],
      ['Fizjo Ruch', 'draft', null],
      ['Kwiaciarnia Pąk', 'no-export', null],
    ]);
    expect(august.bookSum).toBe(30);
    expect(august.bookSumPrevious).toBe(7);

    const october = await monthOverview(alice.db, '2026-10');
    expect(october.rows.every((r) => r.status === 'no-export' && r.views === null)).toBe(true);
    expect(october.sentCount).toBe(0);
    expect(october.bookSum).toBeNull();
    expect(october.bookSumPrevious).toBe(64);
  });

  it('bez żadnych raportów sumy to brak danych (null), nie 0', async () => {
    const old = await monthOverview(alice.db, '2025-01');
    expect(old.bookSum).toBeNull();
    expect(old.bookSumPrevious).toBeNull();
    expect(old.total).toBe(4);
  });

  it('drugi użytkownik widzi tylko swoich klientów i swoje liczby', async () => {
    const overview = await monthOverview(bob.db, '2026-09');
    expect(overview.rows).toEqual([
      { id: ids.cudzy, name: 'Klient Boba', status: 'sent', book: 999, call: 999, views: 999 },
    ]);
    expect(overview.bookSum).toBe(999);
    expect(overview.bookSumPrevious).toBe(888);
  });

  it('nowe konto bez klientów: pusta lista', async () => {
    const fresh = await createUser('panel-empty');
    try {
      expect(await monthOverview(fresh.db, '2026-09')).toEqual({
        rows: [],
        sentCount: 0,
        total: 0,
        bookSum: null,
        bookSumPrevious: null,
      });
    } finally {
      await deleteUser(fresh.id);
    }
  });

  it('bez sesji (anon) — błąd bez treści błędu bazy', async () => {
    const error = await monthOverview(anon, '2026-09').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PanelDataError);
    expect((error as Error).message).toBe('Panel klientów: operacja „clients” nie powiodła się.');
  });
});

describe('currentPlan', () => {
  it('plan z własnego profilu', async () => {
    expect(await currentPlan(alice.db)).toBe('free');
    await sql(`update public.profiles set plan = 'solo' where id = $1`, [bob.id]);
    expect(await currentPlan(bob.db)).toBe('solo');
    expect(await currentPlan(alice.db)).toBe('free');
  });
});

describe('createClient', () => {
  async function stored(id: string) {
    const rows = await sql<{ owner_id: string; name: string; industry: string; included_in_free: boolean }>(
      'select owner_id, name, industry, included_in_free from public.clients where id = $1',
      [id],
    );
    return rows[0];
  }

  it('pierwszy klient jest „w planie darmowym” (trigger), kolejni nie — nawet gdy wejście tego żąda', async () => {
    const first = await createClient(carol.db, { name: '  Pierwszy   klient ', industry: 'salon' });
    expect(first.name).toBe('Pierwszy klient');
    expect(await stored(first.id)).toEqual({
      owner_id: carol.id,
      name: 'Pierwszy klient',
      industry: 'salon',
      included_in_free: true,
    });

    const second = await createClient(carol.db, {
      name: 'Drugi',
      included_in_free: true,
      owner_id: alice.id,
    } as ClientInput);
    expect(await stored(second.id)).toEqual({
      owner_id: carol.id,
      name: 'Drugi',
      industry: 'inne',
      included_in_free: false,
    });
  });

  it('złe dane nie trafiają do bazy', async () => {
    const before = await sql('select count(*)::int as n from public.clients where owner_id = $1', [carol.id]);
    await expect(createClient(carol.db, { name: '' })).rejects.toThrow();
    await expect(createClient(carol.db, { name: '   ' })).rejects.toThrow();
    await expect(createClient(carol.db, { name: '🙂' })).rejects.toThrow();
    await expect(createClient(carol.db, { name: 'x'.repeat(81) })).rejects.toThrow();
    await expect(createClient(carol.db, { name: 'Kadr', industry: 'kasyno' as never })).rejects.toThrow();
    const after = await sql('select count(*)::int as n from public.clients where owner_id = $1', [carol.id]);
    expect(after[0]?.n).toBe(before[0]?.n);
  });

  it('bez sesji zapis jest odrzucony', async () => {
    await expect(createClient(anon, { name: 'Anonim' })).rejects.toBeInstanceOf(PanelDataError);
    expect(await sql(`select 1 from public.clients where name = 'Anonim'`)).toEqual([]);
  });
});

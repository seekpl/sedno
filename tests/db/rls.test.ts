/**
 * Kryterium akceptacji Fazy 2 (PROMPT.md §18): RLS uniemożliwia odczyt i zmianę cudzych danych — test z dwoma
 * użytkownikami przez PostgREST, tak jak działa zalogowana przeglądarka. Do tego: kolumny, których użytkownik
 * nie może zmienić sam (plan, klient w planie darmowym, odblokowanie), i dostęp anonimowy.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anon, createUser, deleteUser, sampleReportData, sql, testToken, type TestUser } from './helpers';

let alice: TestUser;
let bob: TestUser;
let aliceClientId: string;
let aliceReportId: string;
let aliceToken: string;

beforeAll(async () => {
  [alice, bob] = await Promise.all([createUser('alice'), createUser('bob')]);
  const client = await alice.db.from('clients').insert({ name: 'Studio Lumi' }).select('id').single();
  if (client.error) throw client.error;
  aliceClientId = client.data.id;
  const report = await alice.db
    .from('reports')
    .insert({ client_id: aliceClientId, period: '2026-09-01', data: sampleReportData() })
    .select('id')
    .single();
  if (report.error) throw report.error;
  aliceReportId = report.data.id;
  aliceToken = testToken();
  const link = await alice.db.from('share_links').insert({ token: aliceToken, report_id: aliceReportId });
  if (link.error) throw link.error;
});

afterAll(async () => {
  await Promise.all([deleteUser(alice.id), deleteUser(bob.id)]);
});

describe('profil powstaje po potwierdzeniu adresu', () => {
  it('trigger tworzy profil i zdarzenie signup_completed', async () => {
    const profile = await alice.db.from('profiles').select('id, plan').single();
    expect(profile.data).toEqual({ id: alice.id, plan: 'free' });
    const events = await sql('select name from public.events where owner_id = $1', [alice.id]);
    expect(events.map((e) => e.name)).toEqual(['signup_completed']);
  });
});

describe('drugi użytkownik nie widzi i nie zmienia cudzych danych', () => {
  it('odczyt: puste listy i brak wiersza po identyfikatorze', async () => {
    for (const table of ['profiles', 'clients', 'reports', 'share_links'] as const) {
      const { data, error } = await bob.db.from(table).select('*');
      expect(error).toBeNull();
      // Bob widzi tylko własny profil.
      expect(data).toEqual(table === 'profiles' ? [expect.objectContaining({ id: bob.id })] : []);
    }
    const byId = await bob.db.from('reports').select('id').eq('id', aliceReportId);
    expect(byId.data).toEqual([]);
  });

  it('zmiana: update cudzych wierszy nie trafia w nic', async () => {
    const client = await bob.db.from('clients').update({ name: 'Przejęty' }).eq('id', aliceClientId).select();
    expect(client.data).toEqual([]);
    const report = await bob.db.from('reports').update({ status: 'ready' }).eq('id', aliceReportId).select();
    expect(report.data).toEqual([]);
    const link = await bob.db
      .from('share_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token', aliceToken)
      .select();
    expect(link.data).toEqual([]);
    const [row] = await sql('select name from public.clients where id = $1', [aliceClientId]);
    expect(row?.name).toBe('Studio Lumi');
  });

  it('zapis: raport przy cudzym kliencie i link do cudzego raportu są odrzucane', async () => {
    const report = await bob.db
      .from('reports')
      .insert({ client_id: aliceClientId, period: '2026-08-01', data: sampleReportData('2026-08') });
    expect(report.error).not.toBeNull();
    const link = await bob.db.from('share_links').insert({ token: testToken(), report_id: aliceReportId });
    expect(link.error).not.toBeNull();
  });

  it('zapis: nie można podać cudzego owner_id', async () => {
    const client = await bob.db.from('clients').insert({ name: 'Podrzucony', owner_id: alice.id } as never);
    expect(client.error).not.toBeNull();
  });
});

describe('kolumny zastrzeżone dla serwera', () => {
  it('użytkownik nie zmieni sobie planu ani ścieżki logo', async () => {
    const plan = await alice.db
      .from('profiles')
      .update({ plan: 'solo' } as never)
      .eq('id', alice.id);
    expect(plan.error?.code).toBe('42501');
    const logo = await alice.db
      .from('profiles')
      .update({ logo_path: `${bob.id}/logo.png` } as never)
      .eq('id', alice.id);
    expect(logo.error?.code).toBe('42501');
    const name = await alice.db
      .from('profiles')
      .update({ brand_name: 'Kadr Social' })
      .eq('id', alice.id)
      .select();
    expect(name.data?.[0]?.brand_name).toBe('Kadr Social');
  });

  it('pierwszy klient jest w planie darmowym, kolejny nie; flagi nie da się ustawić', async () => {
    const second = await alice.db
      .from('clients')
      .insert({ name: 'Bistro Pod Lipą' })
      .select('included_in_free')
      .single();
    expect(second.data?.included_in_free).toBe(false);
    const [first] = await sql('select included_in_free from public.clients where id = $1', [aliceClientId]);
    expect(first?.included_in_free).toBe(true);
    const flag = await alice.db
      .from('clients')
      .update({ included_in_free: true } as never)
      .eq('id', aliceClientId);
    expect(flag.error?.code).toBe('42501');
  });

  it('użytkownik nie odblokuje raportu sam', async () => {
    const unlocked = await alice.db
      .from('reports')
      .update({ unlocked: true } as never)
      .eq('id', aliceReportId);
    expect(unlocked.error?.code).toBe('42501');
  });
});

describe('dostęp anonimowy', () => {
  it('klucz anon nie czyta żadnej tabeli', async () => {
    for (const table of ['profiles', 'clients', 'reports', 'share_links', 'events', 'waitlist'] as const) {
      const { data, error } = await anon.from(table).select('*');
      expect(error === null ? data : []).toEqual([]);
    }
  });

  it('get_shared_report zwraca treść bez identyfikatorów i liczy wyświetlenia', async () => {
    const { data: raw } = await anon.rpc('get_shared_report', { p_token: aliceToken });
    const data = raw as { data: { headline: string }; branding: string; hasLogo: boolean };
    expect(Object.keys(data).sort()).toEqual(['branding', 'data', 'hasLogo']);
    expect(data.data.headline).toBe('23 osoby chciały się umówić');
    expect(JSON.stringify(data)).not.toContain(alice.id);
    expect(JSON.stringify(data)).not.toContain(aliceReportId);
    const [link] = await sql('select views from public.share_links where token = $1', [aliceToken]);
    expect(link?.views).toBe(1);
  });

  it('odwołany, przeterminowany albo zmyślony link nic nie zwraca', async () => {
    const revoked = testToken();
    await alice.db.from('share_links').insert({ token: revoked, report_id: aliceReportId });
    await alice.db.from('share_links').update({ revoked_at: new Date().toISOString() }).eq('token', revoked);
    const expired = testToken();
    await sql(
      "insert into public.share_links (token, report_id, owner_id, expires_at) values ($1, $2, $3, now() - interval '1 minute')",
      [expired, aliceReportId, alice.id],
    );
    for (const token of [revoked, expired, testToken(), "x' or '1'='1", '']) {
      const { data } = await anon.rpc('get_shared_report', { p_token: token });
      expect(data).toBeNull();
    }
  });
});

describe('usunięcie konta', () => {
  it('kasuje kaskadowo profil, klientów, raporty i linki; zdarzenia zostają bez właściciela', async () => {
    const carol = await createUser('carol');
    const client = await carol.db.from('clients').insert({ name: 'Fizjo Ruch' }).select('id').single();
    const report = await carol.db
      .from('reports')
      .insert({ client_id: client.data!.id, period: '2026-09-01', data: sampleReportData() })
      .select('id')
      .single();
    await carol.db.from('share_links').insert({ token: testToken(), report_id: report.data!.id });
    await deleteUser(carol.id);
    for (const table of ['profiles', 'clients', 'reports', 'share_links']) {
      const column = table === 'profiles' ? 'id' : 'owner_id';
      expect(await sql(`select 1 from public.${table} where ${column} = $1`, [carol.id])).toEqual([]);
    }
    const events = await sql(
      "select owner_id from public.events where name = 'signup_completed' and owner_id = $1",
      [carol.id],
    );
    expect(events).toEqual([]);
  });
});

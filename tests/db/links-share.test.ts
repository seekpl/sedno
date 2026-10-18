/**
 * Linki do raportu (lib/data/links.ts) na lokalnym stosie Supabase, jako zalogowany użytkownik (RLS):
 * token z lib/links/token.ts, ważność 12 miesięcy, jeden aktywny link na raport, wyłączenie (raport publiczny
 * przestaje działać), licznik otwarć z get_shared_report i cudze tokeny oraz raporty bez skutku.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { anon, createUser, deleteUser, sampleReportData, sql, type TestUser } from './helpers';

vi.mock('server-only', () => ({}));

const {
  createLink,
  getActiveLink,
  LINKS_PER_REPORT_MAX,
  LinkQuotaError,
  LinkReportNotFoundError,
  revokeLink,
} = await import('@/lib/data/links');
const { saveReport } = await import('@/lib/data/reports');

let alice: TestUser;
let bob: TestUser;
let reportId: string;
let otherReportId: string;

async function addReport(user: TestUser, name: string, period: string): Promise<string> {
  const { data, error } = await user.db.from('clients').insert({ name }).select('id').single();
  if (error) throw error;
  const saved = await saveReport(user.db, {
    clientId: data.id,
    period,
    intent: 'ready',
    data: sampleReportData(period, name) as never,
  });
  return saved.id;
}

async function activeCount(id: string): Promise<number> {
  const rows = await sql<{ n: number }>(
    'select count(*)::int as n from public.share_links where report_id = $1 and revoked_at is null',
    [id],
  );
  return rows[0]?.n ?? 0;
}

async function shared(token: string) {
  const { data, error } = await anon.rpc('get_shared_report', { p_token: token });
  if (error) throw error;
  return data as { data: { client: { name: string } }; hasLogo: boolean } | null;
}

beforeAll(async () => {
  [alice, bob] = await Promise.all([createUser('links-a'), createUser('links-b')]);
  [reportId, otherReportId] = await Promise.all([
    addReport(alice, 'Studio Lumi', '2026-09'),
    addReport(bob, 'Kawiarnia Bob', '2026-09'),
  ]);
});

afterAll(async () => {
  await Promise.all([deleteUser(alice.id), deleteUser(bob.id)]);
});

describe('tworzenie linku', () => {
  let first: string;

  it('nowy link: 22 znaki base62, ważny 12 miesięcy, 0 otwarć, aktywny', async () => {
    const now = new Date();
    const link = await createLink(alice.db, reportId);
    first = link.token;
    expect(link.token).toMatch(/^[0-9A-Za-z]{22}$/);
    expect(link.views).toBe(0);
    const months = (new Date(link.expiresAt).getTime() - now.getTime()) / (30.44 * 864e5);
    expect(months).toBeGreaterThan(11.9);
    expect(months).toBeLessThan(12.1);
    expect(await getActiveLink(alice.db, reportId)).toEqual(link);
    expect(await activeCount(reportId)).toBe(1);
  });

  it('raport publiczny działa i liczy otwarcia, bez identyfikatorów', async () => {
    const opened = await shared(first);
    expect(opened?.data.client.name).toBe('Studio Lumi');
    expect(JSON.stringify(opened)).not.toContain(alice.id);
    expect(JSON.stringify(opened)).not.toContain(reportId);
    expect((await getActiveLink(alice.db, reportId))?.views).toBe(1);
  });

  it('kolejny link wyłącza poprzedni: zawsze jeden aktywny', async () => {
    const second = await createLink(alice.db, reportId);
    expect(second.token).not.toBe(first);
    expect(await activeCount(reportId)).toBe(1);
    expect((await getActiveLink(alice.db, reportId))?.token).toBe(second.token);
    expect(await shared(first)).toBeNull();
    expect((await shared(second.token))?.data.client.name).toBe('Studio Lumi');
    const revoked = await sql('select revoked_at from public.share_links where token = $1', [first]);
    expect(revoked[0]?.revoked_at).not.toBeNull();
  });

  it('kolizja tokenu (praktycznie niemożliwa) — kolejna próba z nowym tokenem', async () => {
    const existing = (await getActiveLink(alice.db, reportId))!.token;
    const fresh = 'Zz0123456789ABCDEFGHIJ';
    const tokens = [existing, fresh];
    const link = await createLink(alice.db, reportId, { token: () => tokens.shift()! });
    expect(link.token).toBe(fresh);
    expect(await activeCount(reportId)).toBe(1);
  });

  it('równoczesne „Utwórz link”: zostaje jeden aktywny, najnowszy', async () => {
    const links = await Promise.all([1, 2, 3].map(() => createLink(alice.db, reportId)));
    expect(await activeCount(reportId)).toBe(1);
    const newest = [...links].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]!;
    expect((await getActiveLink(alice.db, reportId))?.token).toBe(newest.token);
  });

  it('limit linków do raportu: LinkQuotaError, a dotychczasowy link dalej działa', async () => {
    const quotaReport = await addReport(alice, 'Fizjo Ruch', '2026-08');
    const active = await createLink(alice.db, quotaReport);
    // Do limitu (także wyłączone linki) brakuje jednego wpisu po wstawieniu 98 wyłączonych.
    await sql(
      `insert into public.share_links (token, report_id, owner_id, revoked_at)
         select substr(md5(random()::text) || md5(random()::text), 1, 22), $1, $2, now()
           from generate_series(1, $3::int)`,
      [quotaReport, alice.id, LINKS_PER_REPORT_MAX - 2],
    );
    const last = await createLink(alice.db, quotaReport);
    expect((await getActiveLink(alice.db, quotaReport))?.token).toBe(last.token);
    await expect(createLink(alice.db, quotaReport)).rejects.toBeInstanceOf(LinkQuotaError);
    // Nieudane utworzenie nie wyłącza adresu, który klient już ma.
    expect((await getActiveLink(alice.db, quotaReport))?.token).toBe(last.token);
    expect((await shared(last.token))?.data.client.name).toBe('Fizjo Ruch');
    expect(await shared(active.token)).toBeNull();
  });

  it('link do cudzego albo nieistniejącego raportu: brak raportu, bez wpisu w bazie', async () => {
    await expect(createLink(alice.db, otherReportId)).rejects.toBeInstanceOf(LinkReportNotFoundError);
    await expect(createLink(alice.db, crypto.randomUUID())).rejects.toBeInstanceOf(LinkReportNotFoundError);
    await expect(createLink(alice.db, 'nie-uuid')).rejects.toBeInstanceOf(LinkReportNotFoundError);
    expect(await activeCount(otherReportId)).toBe(0);
  });
});

describe('wyłączenie linku', () => {
  it('link przestaje działać; ponowne wyłączenie to też sukces', async () => {
    const link = await createLink(alice.db, reportId);
    expect(await revokeLink(alice.db, link.token)).toBe('revoked');
    expect(await getActiveLink(alice.db, reportId)).toBeNull();
    expect(await shared(link.token)).toBeNull();
    expect(await revokeLink(alice.db, link.token)).toBe('revoked');
  });

  it('nieznany, zły i cudzy token: brak skutku', async () => {
    const bobs = await createLink(bob.db, otherReportId);
    expect(await revokeLink(alice.db, bobs.token)).toBe('not-found');
    expect((await getActiveLink(bob.db, otherReportId))?.token).toBe(bobs.token);
    expect((await shared(bobs.token))?.data.client.name).toBe('Kawiarnia Bob');
    expect(await revokeLink(alice.db, 'A'.repeat(22))).toBe('not-found');
    expect(await revokeLink(alice.db, 'zły token')).toBe('not-found');
  });
});

describe('aktywny link', () => {
  it('cudzy raport i zły identyfikator: null', async () => {
    expect(await getActiveLink(alice.db, otherReportId)).toBeNull();
    expect(await getActiveLink(alice.db, 'nie-uuid')).toBeNull();
  });

  it('przeterminowany link nie jest aktywny', async () => {
    const link = await createLink(alice.db, reportId);
    await sql("update public.share_links set expires_at = now() - interval '1 minute' where token = $1", [
      link.token,
    ]);
    expect(await getActiveLink(alice.db, reportId)).toBeNull();
    expect(await shared(link.token)).toBeNull();
  });
});

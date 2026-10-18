/**
 * Raport publiczny na lokalnym stosie (lib/data/shared.ts, app/r/[token]/logo/route.ts): aktywny link daje
 * raport po schemacie i liczy jedno wyświetlenie na wywołanie; odwołany, przeterminowany, nieznany i zły
 * token → not-found bez zmiany licznika; robot podglądu linku nie liczy wyświetlenia; logo tylko przez aktywny
 * link (trasa: 404 dla odwołanego) i bez liczenia wyświetleń.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANON_KEY, SERVICE_ROLE_KEY, SUPABASE_URL } from '../../scripts/local-supabase/config';
import { admin, createUser, deleteUser, sampleReportData, sql, testToken, type TestUser } from './helpers';

vi.mock('server-only', () => ({}));
const h = vi.hoisted(() => ({ ip: '203.0.113.7', ua: 'Mozilla/5.0 (iPhone) Safari/604.1' }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': h.ip, 'user-agent': h.ua }),
}));
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);
vi.stubEnv('NEXT_PUBLIC_ACCOUNTS_ENABLED', 'true');

const shared = await import('@/lib/data/shared');
const { GET: logoRoute } = await import('@/app/r/[token]/logo/route');
const { saveLogo } = await import('@/lib/logo/store');
const { checkLogo } = await import('@/lib/logo/validate');
const { resetRateLimits } = await import('@/lib/server/rate-limit');

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7]);

let owner: TestUser;
let reportId: string;
const tokens = { active: testToken(), revoked: testToken(), expired: testToken(), unknown: testToken() };

async function views(token: string): Promise<number | undefined> {
  const [row] = await sql<{ views: number }>('select views from public.share_links where token = $1', [
    token,
  ]);
  return row?.views;
}

const logo = (token: string) => logoRoute({} as never, { params: Promise.resolve({ token }) });

beforeAll(async () => {
  owner = await createUser('share');
  const client = await owner.db.from('clients').insert({ name: 'Studio Lumi' }).select('id').single();
  const report = await owner.db
    .from('reports')
    .insert({ client_id: client.data!.id, period: '2026-09-01', data: sampleReportData() })
    .select('id')
    .single();
  reportId = report.data!.id;
  for (const token of [tokens.active, tokens.revoked]) {
    const { error } = await owner.db.from('share_links').insert({ token, report_id: reportId });
    if (error) throw new Error(error.message);
  }
  await owner.db
    .from('share_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token', tokens.revoked);
  await sql(
    "insert into public.share_links (token, report_id, owner_id, expires_at) values ($1, $2, $3, now() - interval '1 minute')",
    [tokens.expired, reportId, owner.id],
  );
});

afterAll(async () => {
  await admin.storage.from('logos').remove([`${owner.id}/logo.png`]);
  await deleteUser(owner.id);
});

beforeEach(() => {
  resetRateLimits();
  h.ip = '203.0.113.7';
  h.ua = 'Mozilla/5.0 (iPhone) Safari/604.1';
});

describe('getSharedReport na lokalnym stosie', () => {
  it('aktywny link: raport po schemacie, bez identyfikatorów, jedno wyświetlenie na wywołanie', async () => {
    const before = (await views(tokens.active))!;
    const result = await shared.getSharedReport(tokens.active);
    expect(result).toEqual({
      status: 'ok',
      data: sampleReportData(),
      branding: 'sedno-footer',
      hasLogo: false,
    });
    const text = JSON.stringify(result);
    for (const id of [owner.id, reportId, tokens.active]) expect(text).not.toContain(id);
    expect(await views(tokens.active)).toBe(before + 1);

    await shared.loadSharedReport(tokens.active);
    expect(await views(tokens.active)).toBe(before + 2);
  });

  it.each([
    ['odwołany', () => tokens.revoked],
    ['przeterminowany', () => tokens.expired],
    ['nieznany', () => tokens.unknown],
  ])('%s link → not-found, licznik bez zmian', async (_label, token) => {
    const before = await views(token());
    expect(await shared.getSharedReport(token())).toEqual({ status: 'not-found' });
    expect(await views(token())).toBe(before);
  });

  it.each(['', 'krotki', `${testToken()}x`, "AbCdEfGhIjKlMnOpQr'; --", 'AbCdEfGhIjKlMnOpQrSt-_'])(
    'zły format „%s” → not-found',
    async (token) => {
      expect(await shared.getSharedReport(token)).toEqual({ status: 'not-found' });
    },
  );

  it('raport niezgodny ze schematem (np. dopisane pole) → not-found', async () => {
    const token = testToken();
    const client = await owner.db.from('clients').insert({ name: 'Bistro' }).select('id').single();
    const report = await owner.db
      .from('reports')
      .insert({
        client_id: client.data!.id,
        period: '2026-08-01',
        data: { ...sampleReportData('2026-08', 'Bistro'), rows: ['opis posta'] },
      })
      .select('id')
      .single();
    await owner.db.from('share_links').insert({ token, report_id: report.data!.id });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await shared.getSharedReport(token)).toEqual({ status: 'not-found' });
    vi.restoreAllMocks();
  });

  it('podgląd linku w komunikatorze (robot) nie liczy wyświetlenia i nie dostaje raportu', async () => {
    const before = await views(tokens.active);
    h.ua = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
    expect(await shared.loadSharedReport(tokens.active)).toEqual({ status: 'preview' });
    h.ua = 'WhatsApp/2.23.20.0 A';
    expect(await shared.loadSharedReport(tokens.active)).toEqual({ status: 'preview' });
    expect(await views(tokens.active)).toBe(before);
  });

  it('60 otwarć na minutę z jednego IP; kolejne nie liczą wyświetleń', async () => {
    h.ip = '198.51.100.60';
    for (let i = 0; i < 60; i++) await shared.loadSharedReport(tokens.revoked);
    const before = await views(tokens.active);
    expect(await shared.loadSharedReport(tokens.active)).toEqual({ status: 'rate-limited' });
    expect(await views(tokens.active)).toBe(before);
  });
});

describe('logo raportu publicznego', () => {
  it('bez logo: hasLogo false i trasa 404', async () => {
    expect(await shared.findSharedLogoPath(admin, tokens.active)).toBeNull();
    expect((await logo(tokens.active)).status).toBe(404);
  });

  it('z logo: hasLogo true, trasa zwraca PNG; odwołany, przeterminowany i nieznany link → 404', async () => {
    const kind = checkLogo(PNG);
    if (!kind.ok) throw new Error('png');
    await saveLogo(owner.id, PNG, kind);

    const result = await shared.getSharedReport(tokens.active);
    expect(result).toMatchObject({ status: 'ok', hasLogo: true });

    const before = await views(tokens.active);
    const ok = await logo(tokens.active);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');
    expect([...new Uint8Array(await ok.arrayBuffer())]).toEqual([...PNG]);
    // Logo nie liczy wyświetleń.
    expect(await views(tokens.active)).toBe(before);

    for (const token of [tokens.revoked, tokens.expired, tokens.unknown]) {
      expect(await shared.readSharedLogo(admin, token)).toBeNull();
      const denied = await logo(token);
      expect(denied.status).toBe(404);
      expect(await denied.text()).toBe('');
    }
  });

  it('odwołanie aktywnego linku od razu zamyka raport i logo', async () => {
    const token = testToken();
    await owner.db.from('share_links').insert({ token, report_id: reportId });
    expect((await shared.getSharedReport(token)).status).toBe('ok');
    await owner.db.from('share_links').update({ revoked_at: new Date().toISOString() }).eq('token', token);
    expect(await shared.getSharedReport(token)).toEqual({ status: 'not-found' });
    expect((await logo(token)).status).toBe(404);
  });
});

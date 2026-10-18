/**
 * Eksport danych konta (lib/data/account.ts) na lokalnym stosie z dwoma użytkownikami: plik zawiera
 * wyłącznie dane eksportującego (RLS), raporty z ReportData i linki jako pełne adresy.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createUser, deleteUser, sampleReportData, testToken, type TestUser } from './helpers';

vi.mock('server-only', () => ({}));
vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://sedno.example');

const { exportAccount } = await import('@/lib/data/account');

type Seeded = { user: TestUser; client: string; token: string };

async function seed(label: string, clientName: string): Promise<Seeded> {
  const user = await createUser(label);
  const client = await user.db.from('clients').insert({ name: clientName }).select('id').single();
  if (client.error) throw client.error;
  const report = await user.db
    .from('reports')
    .insert({
      client_id: client.data.id,
      period: '2026-09-01',
      status: 'sent',
      sent_at: '2026-09-27T12:00:00Z',
      data: sampleReportData('2026-09', clientName),
    })
    .select('id')
    .single();
  if (report.error) throw report.error;
  const token = testToken();
  const link = await user.db.from('share_links').insert({ token, report_id: report.data.id });
  if (link.error) throw link.error;
  await user.db
    .from('profiles')
    .update({ brand_name: `${clientName} marka` })
    .eq('id', user.id);
  return { user, client: clientName, token };
}

let a: Seeded;
let b: Seeded;

beforeAll(async () => {
  [a, b] = await Promise.all([seed('export-a', 'Studio Lumi A'), seed('export-b', 'Bistro B')]);
});

afterAll(async () => {
  await Promise.all([deleteUser(a.user.id), deleteUser(b.user.id)]);
});

describe('eksport danych konta', () => {
  it('zawiera tylko dane eksportującego', async () => {
    const result = await exportAccount(a.user.db, { email: a.user.email });
    const json = JSON.stringify(result);

    expect(result.profile).toMatchObject({
      email: a.user.email,
      brand_name: 'Studio Lumi A marka',
      plan: 'free',
    });
    expect(result.clients.map((c) => c.name)).toEqual(['Studio Lumi A']);
    expect(result.reports).toHaveLength(1);
    expect(result.reports[0]).toMatchObject({
      client: 'Studio Lumi A',
      period: '2026-09',
      status: 'sent',
      data: sampleReportData('2026-09', 'Studio Lumi A'),
    });
    expect(result.links).toEqual([
      expect.objectContaining({
        client: 'Studio Lumi A',
        period: '2026-09',
        url: `https://sedno.example/r/${a.token}`,
        revoked_at: null,
        views: 0,
      }),
    ]);

    for (const foreign of [b.client, b.token, b.user.id, b.user.email, 'Bistro B marka']) {
      expect(json).not.toContain(foreign);
    }
    // Bez identyfikatorów z bazy (adres testowy zawiera identyfikator użytkownika, więc bez pola e-mail).
    const withoutEmail = JSON.stringify({ ...result, profile: { ...result.profile, email: null } });
    expect(withoutEmail).not.toContain(a.user.id);
  });

  it('drugi użytkownik widzi wyłącznie swoje', async () => {
    const result = await exportAccount(b.user.db, { email: b.user.email });
    expect(result.clients.map((c) => c.name)).toEqual(['Bistro B']);
    expect(JSON.stringify(result)).not.toContain(a.token);
  });
});

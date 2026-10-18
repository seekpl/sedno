/**
 * Usunięcie konta (lib/data/account.ts) na lokalnym stosie: znika użytkownik Supabase Auth, profil,
 * klienci, raporty, linki i plik logo; zdarzenia zostają bez właściciela; cudze dane bez zmian.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ANON_KEY, SERVICE_ROLE_KEY, SUPABASE_URL } from '../../scripts/local-supabase/config';
import { admin, createUser, deleteUser, sampleReportData, sql, testToken, type TestUser } from './helpers';

vi.mock('server-only', () => ({}));
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

const { deleteAccount } = await import('@/lib/data/account');
const { readLogo, saveLogo } = await import('@/lib/logo/store');
const { checkLogo } = await import('@/lib/logo/validate');

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7]);

async function seedAccount(user: TestUser) {
  const client = await user.db.from('clients').insert({ name: 'Studio Lumi' }).select('id').single();
  if (client.error) throw client.error;
  const report = await user.db
    .from('reports')
    .insert({ client_id: client.data.id, period: '2026-09-01', data: sampleReportData() })
    .select('id')
    .single();
  if (report.error) throw report.error;
  const link = await user.db.from('share_links').insert({ token: testToken(), report_id: report.data.id });
  if (link.error) throw link.error;
}

const counts = async (owner: string) =>
  (
    await sql<{ profiles: number; clients: number; reports: number; links: number }>(
      `select (select count(*)::int from public.profiles where id = $1) as profiles,
              (select count(*)::int from public.clients where owner_id = $1) as clients,
              (select count(*)::int from public.reports where owner_id = $1) as reports,
              (select count(*)::int from public.share_links where owner_id = $1) as links`,
      [owner],
    )
  )[0];

let user: TestUser;
let other: TestUser;

beforeAll(async () => {
  [user, other] = await Promise.all([createUser('delete'), createUser('delete-other')]);
  await Promise.all([seedAccount(user), seedAccount(other)]);
});

afterAll(async () => {
  await deleteUser(user.id).catch(() => {});
  await deleteUser(other.id);
});

describe('usunięcie konta', () => {
  it('usuwa użytkownika, dane i logo; zdarzenia zostają anonimowe; cudze dane bez zmian', async () => {
    const kind = checkLogo(png);
    if (!kind.ok) throw new Error('png');
    const path = await saveLogo(user.id, png, kind);
    expect(await readLogo(path)).not.toBeNull();
    const otherKind = checkLogo(png);
    if (!otherKind.ok) throw new Error('png');
    const otherPath = await saveLogo(other.id, png, otherKind);

    const [event] = await sql<{ id: string }>(
      `insert into public.events (name, owner_id, props) values ('link_created', $1, '{}') returning id`,
      [user.id],
    );
    expect(await counts(user.id)).toEqual({ profiles: 1, clients: 1, reports: 1, links: 1 });

    await deleteAccount(admin, user.id);

    const auth = await admin.auth.admin.getUserById(user.id);
    expect(auth.data.user).toBeNull();
    expect(await counts(user.id)).toEqual({ profiles: 0, clients: 0, reports: 0, links: 0 });
    expect(await readLogo(path)).toBeNull();

    const [anonymous] = await sql<{ owner_id: string | null }>(
      'select owner_id from public.events where id = $1',
      [event!.id],
    );
    expect(anonymous?.owner_id).toBeNull();

    expect(await counts(other.id)).toEqual({ profiles: 1, clients: 1, reports: 1, links: 1 });
    expect(await readLogo(otherPath)).not.toBeNull();
    await sql('delete from public.events where id = $1', [event!.id]);
  });

  it('konto bez logo też się usuwa', async () => {
    const bare = await createUser('delete-bare');
    await deleteAccount(admin, bare.id);
    expect((await admin.auth.admin.getUserById(bare.id)).data.user).toBeNull();
    expect(await counts(bare.id)).toEqual({ profiles: 0, clients: 0, reports: 0, links: 0 });
  });
});

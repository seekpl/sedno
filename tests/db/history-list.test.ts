/**
 * Historia raportów (lib/data/history.ts) na lokalnym stosie: tylko własne raporty (RLS), kolejność (miesiąc
 * malejąco, potem klient alfabetycznie), strony po 20 z dokładną liczbą, strona spoza zakresu → ostatnia,
 * stan linku (aktywny, wyłączony, wygasły, brak).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { addMonths } from '@/lib/i18n/pl';
import { createUser, deleteUser, sampleReportData, sql, testToken, type TestUser } from './helpers';

vi.mock('server-only', () => ({}));

const { listReports } = await import('@/lib/data/history');

let user: TestUser;
let other: TestUser;
const clients: Record<string, string> = {};
/** Raporty za 2026-09 (do stanów linku): klient → id raportu. */
const september: Record<string, string> = {};

beforeAll(async () => {
  [user, other] = await Promise.all([createUser('history'), createUser('history-other')]);
  for (const name of ['Zeta', 'Alfa', 'Beta']) {
    const created = await user.db.from('clients').insert({ name }).select('id').single();
    if (created.error) throw created.error;
    clients[name] = created.data.id;
  }
  // 23 raporty: 8 miesięcy × 3 klientów bez jednego (Zeta w najstarszym miesiącu).
  const rows = [];
  for (let i = 0; i < 8; i++) {
    const month = addMonths('2026-09', -i);
    for (const name of ['Zeta', 'Alfa', 'Beta']) {
      if (i === 7 && name === 'Zeta') continue;
      rows.push({
        client_id: clients[name]!,
        period: `${month}-01`,
        data: sampleReportData(month, name),
        ...(name === 'Alfa' && i === 0 ? { status: 'sent' as const, sent_at: '2026-09-27T10:00:00Z' } : {}),
      });
    }
  }
  const inserted = await user.db.from('reports').insert(rows).select('id, client_id, period');
  if (inserted.error) throw inserted.error;
  for (const r of inserted.data) {
    if (r.period !== '2026-09-01') continue;
    const name = Object.keys(clients).find((n) => clients[n] === r.client_id)!;
    september[name] = r.id;
  }

  // Alfa: aktywny link; Beta: link wyłączony; Zeta: link wygasły (termin zmienia tylko serwer — tu SQL).
  const alfa = await user.db.from('share_links').insert({ token: testToken(), report_id: september.Alfa! });
  const betaToken = testToken();
  const beta = await user.db.from('share_links').insert({ token: betaToken, report_id: september.Beta! });
  const zetaToken = testToken();
  const zeta = await user.db.from('share_links').insert({ token: zetaToken, report_id: september.Zeta! });
  if (alfa.error || beta.error || zeta.error) throw alfa.error ?? beta.error ?? zeta.error;
  await user.db.from('share_links').update({ revoked_at: new Date().toISOString() }).eq('token', betaToken);
  await sql(`update public.share_links set expires_at = now() - interval '1 day' where token = $1`, [
    zetaToken,
  ]);

  const foreign = await other.db.from('clients').insert({ name: 'Cudzy klient' }).select('id').single();
  if (foreign.error) throw foreign.error;
  await other.db
    .from('reports')
    .insert({ client_id: foreign.data.id, period: '2026-09-01', data: sampleReportData() });
});

afterAll(async () => {
  await Promise.all([deleteUser(user.id), deleteUser(other.id)]);
});

describe('historia raportów', () => {
  it('pierwsza strona: 20 raportów, miesiąc malejąco, potem klient alfabetycznie; dokładna liczba', async () => {
    const page = await listReports(user.db, 1);
    expect(page.total).toBe(23);
    expect(page.page).toBe(1);
    expect(page.pageCount).toBe(2);
    expect(page.rows).toHaveLength(20);
    expect(page.rows.slice(0, 4).map((r) => [r.month, r.clientName])).toEqual([
      ['2026-09', 'Alfa'],
      ['2026-09', 'Beta'],
      ['2026-09', 'Zeta'],
      ['2026-08', 'Alfa'],
    ]);
    const months = page.rows.map((r) => r.month);
    expect([...months].sort().reverse()).toEqual(months);
    expect(page.rows.every((r) => r.clientName !== 'Cudzy klient')).toBe(true);
  });

  it('druga strona: pozostałe 3; strona spoza zakresu → ostatnia', async () => {
    const second = await listReports(user.db, 2);
    expect(second.rows.map((r) => [r.month, r.clientName])).toEqual([
      ['2026-03', 'Zeta'],
      ['2026-02', 'Alfa'],
      ['2026-02', 'Beta'],
    ]);
    const beyond = await listReports(user.db, 99);
    expect(beyond.page).toBe(2);
    expect(beyond.rows).toHaveLength(3);
  });

  it('status, data wysłania i stan linku', async () => {
    const [alfa, beta, zeta, older] = (await listReports(user.db, 1)).rows;
    expect(alfa).toMatchObject({
      clientId: clients.Alfa,
      status: 'sent',
      sentAt: expect.stringMatching(/^2026-09-27T10:00:00/),
      link: 'active',
    });
    expect(beta).toMatchObject({ status: 'draft', sentAt: null, link: 'revoked' });
    expect(zeta).toMatchObject({ link: 'expired' });
    expect(older).toMatchObject({ link: 'none' });
  });

  it('drugi użytkownik widzi tylko swój raport', async () => {
    const page = await listReports(other.db, 1);
    expect(page.total).toBe(1);
    expect(page.rows.map((r) => r.clientName)).toEqual(['Cudzy klient']);
  });

  it('bez raportów: pusta lista, jedna strona', async () => {
    const fresh = await createUser('history-empty');
    try {
      expect(await listReports(fresh.db, 1)).toEqual({ rows: [], total: 0, page: 1, pageCount: 1 });
      expect(await listReports(fresh.db, 3)).toEqual({ rows: [], total: 0, page: 1, pageCount: 1 });
    } finally {
      await deleteUser(fresh.id);
    }
  });
});

/**
 * Raporty edytora (lib/data/reports.ts) na lokalnym stosie Supabase, jako zalogowany użytkownik (RLS):
 * zapis szkicu i „do wysyłki” (wstawienie albo zmiana pary klient–miesiąc), przejścia statusów, oznaczenie
 * wysłania i cofnięcie, historia M−1, normalizacja danych przez serwer i cudze identyfikatory bez skutku.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from '@/lib/zod';
import { createUser, deleteUser, sampleReportData, sql, type TestUser } from './helpers';

vi.mock('server-only', () => ({}));

const {
  getClient,
  getPreviousReport,
  getReport,
  getReportAuthor,
  markSent,
  nextStatus,
  ReportNotFoundError,
  saveReport,
  undoSent,
} = await import('@/lib/data/reports');

let alice: TestUser;
let bob: TestUser;
let lumi: string;
let bistro: string;
let bobClient: string;

async function addClient(user: TestUser, name: string): Promise<string> {
  const { data, error } = await user.db.from('clients').insert({ name }).select('id').single();
  if (error) throw error;
  return data.id;
}

function data(period: string, overrides: Record<string, unknown> = {}) {
  return { ...sampleReportData(period, 'Studio Lumi'), ...overrides } as ReturnType<
    typeof sampleReportData
  > as never;
}

async function row(clientId: string, month: string) {
  const rows = await sql<{ status: string; sent_at: Date | null; data: Record<string, unknown> }>(
    'select status, sent_at, data from public.reports where client_id = $1 and period = $2',
    [clientId, `${month}-01`],
  );
  return rows[0];
}

beforeAll(async () => {
  [alice, bob] = await Promise.all([createUser('editor-a'), createUser('editor-b')]);
  [lumi, bistro, bobClient] = await Promise.all([
    addClient(alice, 'Studio Lumi'),
    addClient(alice, 'Bistro Pod Lipą'),
    addClient(bob, 'Kawiarnia Bob'),
  ]);
  await sql("update public.profiles set display_name = 'Ala', brand_name = 'Kadr Social' where id = $1", [
    alice.id,
  ]);
});

afterAll(async () => {
  await Promise.all([deleteUser(alice.id), deleteUser(bob.id)]);
});

describe('klient i autor', () => {
  it('własny klient tak, cudzy i zły identyfikator nie', async () => {
    expect(await getClient(alice.db, lumi)).toEqual({ id: lumi, name: 'Studio Lumi', archived: false });
    expect(await getClient(bob.db, lumi)).toBeNull();
    expect(await getClient(alice.db, 'nie-uuid')).toBeNull();
    expect(await getClient(alice.db, crypto.randomUUID())).toBeNull();
  });

  it('autor: marka przed nazwą, logo z profilu', async () => {
    expect(await getReportAuthor(alice.db)).toEqual({ name: 'Kadr Social', hasLogo: false });
    expect(await getReportAuthor(bob.db)).toEqual({ name: '', hasLogo: false });
    await sql("update public.profiles set display_name = 'Bob B.', logo_path = $2 where id = $1", [
      bob.id,
      `${bob.id}/logo.png`,
    ]);
    expect(await getReportAuthor(bob.db)).toEqual({ name: 'Bob B.', hasLogo: true });
    await sql('update public.profiles set display_name = null, logo_path = null where id = $1', [bob.id]);
  });
});

describe('zapis raportu', () => {
  it('nowy szkic: status „Szkic”, nazwa klienta, autor i branding z bazy', async () => {
    const saved = await saveReport(alice.db, {
      clientId: lumi,
      period: '2026-09',
      intent: 'draft',
      data: data('2026-09', {
        client: { name: 'Inna nazwa' },
        author: { name: 'Ktoś', logoUrl: 'https://example.com/logo.png' },
        branding: 'author',
      }),
    });
    expect(saved).toMatchObject({ clientId: lumi, month: '2026-09', status: 'draft', sentAt: null });
    expect(saved.data.client).toEqual({ name: 'Studio Lumi' });
    expect(saved.data.author).toEqual({ name: 'Kadr Social' });
    expect(saved.data.branding).toBe('sedno-footer');
    const stored = await row(lumi, '2026-09');
    expect(stored?.status).toBe('draft');
    expect(stored?.data).toMatchObject({ client: { name: 'Studio Lumi' }, branding: 'sedno-footer' });
    expect(await getReport(alice.db, lumi, '2026-09')).toEqual(saved);
  });

  it('kolejny szkic zmienia dane tego samego raportu (jeden wiersz na klienta i miesiąc)', async () => {
    const first = await getReport(alice.db, lumi, '2026-09');
    const saved = await saveReport(alice.db, {
      clientId: lumi,
      period: '2026-09',
      intent: 'draft',
      data: data('2026-09', { headline: 'Nowy tytuł' }),
    });
    expect(saved.id).toBe(first?.id);
    expect(saved.data.headline).toBe('Nowy tytuł');
    expect(saved.status).toBe('draft');
    const count = await sql('select count(*)::int as n from public.reports where client_id = $1', [lumi]);
    expect(count[0]?.n).toBe(1);
  });

  it('„do wysyłki” zmienia szkic na „Gotowy”; kolejny szkic zostawia „Gotowy”', async () => {
    expect(
      (
        await saveReport(alice.db, {
          clientId: lumi,
          period: '2026-09',
          intent: 'ready',
          data: data('2026-09'),
        })
      ).status,
    ).toBe('ready');
    expect(
      (
        await saveReport(alice.db, {
          clientId: lumi,
          period: '2026-09',
          intent: 'draft',
          data: data('2026-09'),
        })
      ).status,
    ).toBe('ready');
  });

  it('nowy raport od razu „do wysyłki” jest „Gotowy”', async () => {
    const saved = await saveReport(alice.db, {
      clientId: bistro,
      period: '2026-09',
      intent: 'ready',
      data: data('2026-09'),
    });
    expect(saved.status).toBe('ready');
    expect(saved.data.client.name).toBe('Bistro Pod Lipą');
  });

  it('równoległe zapisy nowego raportu dają jeden wiersz', async () => {
    const results = await Promise.all(
      [1, 2, 3].map((n) =>
        saveReport(alice.db, {
          clientId: bistro,
          period: '2026-07',
          intent: 'draft',
          data: data('2026-07', { headline: `Tytuł ${n}` }),
        }),
      ),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    const count = await sql(
      "select count(*)::int as n from public.reports where client_id = $1 and period = '2026-07-01'",
      [bistro],
    );
    expect(count[0]?.n).toBe(1);
  });

  it('odrzuca złe dane: miesiąc niezgodny z danymi, dodatkowe pola, zły identyfikator', async () => {
    await expect(
      saveReport(alice.db, { clientId: lumi, period: '2026-08', intent: 'draft', data: data('2026-09') }),
    ).rejects.toBeInstanceOf(z.ZodError);
    await expect(
      saveReport(alice.db, {
        clientId: lumi,
        period: '2026-09',
        intent: 'draft',
        data: data('2026-09', { rows: [{ caption: 'opis posta' }] }),
      }),
    ).rejects.toBeInstanceOf(z.ZodError);
    await expect(
      saveReport(alice.db, { clientId: 'x', period: '2026-09', intent: 'draft', data: data('2026-09') }),
    ).rejects.toBeInstanceOf(z.ZodError);
    await expect(
      saveReport(alice.db, {
        clientId: lumi,
        period: '2026-09',
        intent: 'send' as never,
        data: data('2026-09'),
      }),
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  it('dane w złym kształcie w bazie: odczyt to brak zapisu, a zapis je nadpisuje', async () => {
    const { error } = await alice.db
      .from('reports')
      .insert({ client_id: lumi, period: '2026-05-01', data: { stary: true } });
    expect(error).toBeNull();
    expect(await getReport(alice.db, lumi, '2026-05')).toBeNull();
    const saved = await saveReport(alice.db, {
      clientId: lumi,
      period: '2026-05',
      intent: 'draft',
      data: data('2026-05'),
    });
    expect(saved.month).toBe('2026-05');
    expect(await getReport(alice.db, lumi, '2026-05')).toEqual(saved);
  });
});

describe('wysłanie i cofnięcie', () => {
  it('oznacz jako wysłany: status „Wysłany” z datą; ponownie — data pierwszego wysłania', async () => {
    const now = new Date('2026-10-02T09:30:00Z');
    const sent = await markSent(alice.db, lumi, '2026-09', now);
    expect(sent).toEqual({ status: 'sent', sentAt: expect.any(String) });
    expect(new Date(sent!.sentAt!).toISOString()).toBe(now.toISOString());
    const again = await markSent(alice.db, lumi, '2026-09', new Date('2026-10-05T09:30:00Z'));
    expect(new Date(again!.sentAt!).toISOString()).toBe(now.toISOString());
  });

  it('edycja wysłanego raportu zostawia go wysłanym (link pokazuje najnowsze dane)', async () => {
    for (const intent of ['draft', 'ready'] as const) {
      const saved = await saveReport(alice.db, {
        clientId: lumi,
        period: '2026-09',
        intent,
        data: data('2026-09', { headline: `Po wysłaniu (${intent})` }),
      });
      expect(saved.status).toBe('sent');
      expect(saved.sentAt).not.toBeNull();
      expect(saved.data.headline).toBe(`Po wysłaniu (${intent})`);
    }
  });

  it('cofnięcie: „Gotowy” bez daty wysłania; drugi raz bez zmian', async () => {
    expect(await undoSent(alice.db, lumi, '2026-09')).toEqual({ status: 'ready', sentAt: null });
    expect(await undoSent(alice.db, lumi, '2026-09')).toEqual({ status: 'ready', sentAt: null });
    const stored = await row(lumi, '2026-09');
    expect(stored).toMatchObject({ status: 'ready', sent_at: null });
  });

  it('bez raportu: null', async () => {
    expect(await markSent(alice.db, lumi, '2020-01')).toBeNull();
    expect(await undoSent(alice.db, lumi, '2020-01')).toBeNull();
  });
});

describe('historia M−1', () => {
  it('raport tego samego klienta za miesiąc wcześniej', async () => {
    await saveReport(alice.db, {
      clientId: lumi,
      period: '2026-08',
      intent: 'ready',
      data: data('2026-08', { actions: { book: 17, call: 11, directions: 10 } }),
    });
    const previous = await getPreviousReport(alice.db, lumi, '2026-09');
    expect(previous?.month).toBe('2026-08');
    expect(previous?.data.actions).toEqual({ book: 17, call: 11, directions: 10 });
  });

  it('innego klienta i bez zapisu: null', async () => {
    expect(await getPreviousReport(alice.db, bistro, '2026-09')).toBeNull();
    expect(await getPreviousReport(alice.db, lumi, '2026-01')).toBeNull();
    expect(await getPreviousReport(bob.db, lumi, '2026-09')).toBeNull();
  });
});

describe('cudze identyfikatory niczego nie znajdują (RLS)', () => {
  it('zapis do cudzego klienta: brak klienta, raport właściciela bez zmian', async () => {
    const before = await row(lumi, '2026-09');
    await expect(
      saveReport(bob.db, {
        clientId: lumi,
        period: '2026-09',
        intent: 'ready',
        data: data('2026-09', { headline: 'Podmiana' }),
      }),
    ).rejects.toBeInstanceOf(ReportNotFoundError);
    await expect(
      saveReport(bob.db, { clientId: lumi, period: '2026-03', intent: 'draft', data: data('2026-03') }),
    ).rejects.toBeInstanceOf(ReportNotFoundError);
    expect(await row(lumi, '2026-09')).toEqual(before);
    expect(await row(lumi, '2026-03')).toBeUndefined();
  });

  it('odczyt, wysłanie i cofnięcie cudzego raportu: null, bez zmian w bazie', async () => {
    const before = await row(lumi, '2026-09');
    expect(await getReport(bob.db, lumi, '2026-09')).toBeNull();
    expect(await markSent(bob.db, lumi, '2026-09')).toBeNull();
    expect(await undoSent(bob.db, lumi, '2026-09')).toBeNull();
    expect(await row(lumi, '2026-09')).toEqual(before);
  });

  it('własny klient drugiego użytkownika działa niezależnie', async () => {
    const saved = await saveReport(bob.db, {
      clientId: bobClient,
      period: '2026-09',
      intent: 'draft',
      data: data('2026-09'),
    });
    expect(saved.data.client.name).toBe('Kawiarnia Bob');
    expect(await getReport(alice.db, bobClient, '2026-09')).toBeNull();
  });
});

describe('nextStatus', () => {
  it('szkic → szkic, do wysyłki → gotowy, wysłany zostaje wysłany', () => {
    expect(nextStatus(null, 'draft')).toBe('draft');
    expect(nextStatus(null, 'ready')).toBe('ready');
    expect(nextStatus('draft', 'draft')).toBe('draft');
    expect(nextStatus('draft', 'ready')).toBe('ready');
    expect(nextStatus('ready', 'draft')).toBe('ready');
    expect(nextStatus('sent', 'draft')).toBe('sent');
    expect(nextStatus('sent', 'ready')).toBe('sent');
  });
});

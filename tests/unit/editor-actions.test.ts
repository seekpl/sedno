/**
 * Działania edytora raportu (app/app/klienci/[id]/[miesiac]/actions.ts): sesja, flaga kont, zod na wejściu
 * (uuid, miesiąc nie z przyszłości, ścisły ReportData, token), limit linków, zdarzenie link_created bez tokenu,
 * odświeżenie list, wyniki w kształcie interfejsu bez treści błędów bazy. Baza jest podmieniona; prawdziwe
 * zapytania sprawdzają tests/db/editor-reports.test.ts i tests/db/links-share.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { editor as t } from '@/lib/copy/editor';
import { EXAMPLE_REPORT } from '@/lib/report/example';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  features: { accounts: true },
  getCurrentUser: vi.fn(),
  revalidatePath: vi.fn(),
  after: vi.fn(),
  recordServerEvent: vi.fn(),
  saveReport: vi.fn(),
  getReport: vi.fn(),
  markSent: vi.fn(),
  undoSent: vi.fn(),
  createLink: vi.fn(),
  revokeLink: vi.fn(),
  db: { marker: 'db' },
}));

vi.mock('@/config/features', () => ({ features: mocks.features }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => mocks.db }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('@/lib/server/server-events', () => ({ recordServerEvent: mocks.recordServerEvent }));
vi.mock('@/lib/data/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/reports')>()),
  saveReport: mocks.saveReport,
  getReport: mocks.getReport,
  markSent: mocks.markSent,
  undoSent: mocks.undoSent,
}));
vi.mock('@/lib/data/links', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/links')>()),
  createLink: mocks.createLink,
  revokeLink: mocks.revokeLink,
}));

const actions = await import('@/app/app/klienci/[id]/[miesiac]/actions');
const { ReportNotFoundError } = await import('@/lib/data/reports');
const { LinkQuotaError, LinkReportNotFoundError } = await import('@/lib/data/links');
const { resetRateLimits } = await import('@/lib/server/rate-limit');

const USER = { id: '11111111-1111-4111-8111-111111111111' };
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const REPORT_ID = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';
const REF = { clientId: CLIENT_ID, month: '2026-09' };

beforeEach(() => {
  vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://sedno.example/');
  mocks.features.accounts = true;
  mocks.getCurrentUser.mockReset().mockResolvedValue(USER);
  for (const fn of [
    mocks.revalidatePath,
    mocks.after,
    mocks.recordServerEvent,
    mocks.saveReport,
    mocks.getReport,
    mocks.markSent,
    mocks.undoSent,
    mocks.createLink,
    mocks.revokeLink,
  ])
    fn.mockReset();
  mocks.saveReport.mockImplementation(
    async (_db, input: { data: typeof EXAMPLE_REPORT; intent: string }) => ({
      id: REPORT_ID,
      clientId: CLIENT_ID,
      month: '2026-09',
      status: input.intent === 'ready' ? 'ready' : 'draft',
      data: input.data,
      sentAt: null,
      updatedAt: '2026-10-13T10:00:00Z',
    }),
  );
  mocks.getReport.mockResolvedValue({ id: REPORT_ID });
  mocks.createLink.mockResolvedValue({
    token: TOKEN,
    createdAt: '2026-10-13T10:00:00Z',
    expiresAt: '2027-10-13T10:00:00Z',
    views: 0,
  });
  mocks.revokeLink.mockResolvedValue('revoked');
  mocks.markSent.mockResolvedValue({ status: 'sent', sentAt: '2026-10-13T10:00:00Z' });
  mocks.undoSent.mockResolvedValue({ status: 'ready', sentAt: null });
  resetRateLimits();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('saveReportAction', () => {
  it('zapisuje ReportData z miesiącem i zamiarem, odświeża panel i historię', async () => {
    const result = await actions.saveReportAction({ ...REF, data: EXAMPLE_REPORT, intent: 'ready' });
    expect(result).toEqual({ ok: true, report: { data: EXAMPLE_REPORT, status: 'ready', sentAt: null } });
    expect(mocks.saveReport).toHaveBeenCalledWith(mocks.db, {
      clientId: CLIENT_ID,
      period: '2026-09',
      data: EXAMPLE_REPORT,
      intent: 'ready',
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/app/klienci');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/app/raporty');
  });

  it.each([
    ['zły identyfikator klienta', { ...REF, clientId: 'x', data: EXAMPLE_REPORT, intent: 'draft' }],
    [
      'miesiąc z przyszłości',
      { ...REF, month: '2026-11', data: { ...EXAMPLE_REPORT, period: '2026-11' }, intent: 'draft' },
    ],
    [
      'miesiąc sprzed zakresu edytora i bazy',
      { ...REF, month: '1999-12', data: { ...EXAMPLE_REPORT, period: '1999-12' }, intent: 'draft' },
    ],
    ['miesiąc niezgodny z danymi', { ...REF, month: '2026-08', data: EXAMPLE_REPORT, intent: 'draft' }],
    ['nieznany zamiar', { ...REF, data: EXAMPLE_REPORT, intent: 'sent' }],
    [
      'wiersze pliku w danych',
      { ...REF, data: { ...EXAMPLE_REPORT, rows: [{ caption: 'opis' }] }, intent: 'draft' },
    ],
    [
      'opis publikacji w najlepszych',
      {
        ...REF,
        data: {
          ...EXAMPLE_REPORT,
          summary: {
            ...EXAMPLE_REPORT.summary,
            topPosts: [
              { publishedAt: '2026-09-03T10:00:00Z', type: 'reel', views: 1, interactions: 1, caption: 'x' },
            ],
          },
        },
        intent: 'draft',
      },
    ],
    ['dodatkowe pole', { ...REF, data: EXAMPLE_REPORT, intent: 'draft', ownerId: USER.id }],
    ['brak danych', null],
  ])('odrzuca: %s', async (_name, input) => {
    expect(await actions.saveReportAction(input)).toEqual({ ok: false, error: t.errors.invalid });
    expect(mocks.saveReport).not.toHaveBeenCalled();
  });

  it('bez sesji albo z wyłączonymi kontami: sesja wygasła', async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect(await actions.saveReportAction({ ...REF, data: EXAMPLE_REPORT, intent: 'draft' })).toEqual({
      ok: false,
      error: t.errors.session,
    });
    mocks.features.accounts = false;
    expect(await actions.saveReportAction({ ...REF, data: EXAMPLE_REPORT, intent: 'draft' })).toEqual({
      ok: false,
      error: t.errors.session,
    });
    expect(mocks.saveReport).not.toHaveBeenCalled();
  });

  it('cudzy klient: „nie ma na Twoim koncie”; błąd bazy: przyczyna bez treści błędu', async () => {
    mocks.saveReport.mockRejectedValueOnce(new ReportNotFoundError());
    expect(await actions.saveReportAction({ ...REF, data: EXAMPLE_REPORT, intent: 'draft' })).toEqual({
      ok: false,
      error: t.errors.notFound,
    });
    mocks.saveReport.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint "x"'));
    const failed = await actions.saveReportAction({ ...REF, data: EXAMPLE_REPORT, intent: 'draft' });
    expect(failed).toEqual({ ok: false, error: t.errors.failed });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('duplicate');
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('Studio Lumi');
  });
});

describe('createLinkAction', () => {
  it('link do zapisanego raportu: pełny adres z NEXT_PUBLIC_SITE_URL, zdarzenie bez tokenu', async () => {
    const result = await actions.createLinkAction(REF);
    expect(result).toEqual({
      ok: true,
      link: {
        token: TOKEN,
        url: `https://sedno.example/r/${TOKEN}`,
        expiresAt: '2027-10-13T10:00:00Z',
        views: 0,
      },
    });
    expect(mocks.getReport).toHaveBeenCalledWith(mocks.db, CLIENT_ID, '2026-09');
    expect(mocks.createLink).toHaveBeenCalledWith(mocks.db, REPORT_ID);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    await mocks.after.mock.calls[0]![0]();
    expect(mocks.recordServerEvent).toHaveBeenCalledWith('link_created', {}, USER.id);
  });

  it('bez zapisanego raportu albo cudzy raport: „nie ma na Twoim koncie”', async () => {
    mocks.getReport.mockResolvedValueOnce(null);
    expect(await actions.createLinkAction(REF)).toEqual({ ok: false, error: t.errors.notFound });
    mocks.createLink.mockRejectedValueOnce(new LinkReportNotFoundError());
    expect(await actions.createLinkAction(REF)).toEqual({ ok: false, error: t.errors.notFound });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it('limit linków do raportu w bazie: przyczyna i naprawa zamiast „serwer nie odpowiedział”', async () => {
    mocks.createLink.mockRejectedValueOnce(new LinkQuotaError());
    const result = await actions.createLinkAction(REF);
    expect(result).toEqual({ ok: false, error: t.errors.linkQuota(100) });
    expect(t.errors.linkQuota(100)).toBe(
      'Ten raport ma już 100 linków, a to limit dla jednego raportu. Wyślij klientowi raport jako PDF.',
    );
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it('limit: 20 nowych linków na 10 minut na konto', async () => {
    for (let i = 0; i < 20; i++) expect((await actions.createLinkAction(REF)).ok).toBe(true);
    expect(await actions.createLinkAction(REF)).toEqual({ ok: false, error: t.errors.rateLimited });
    expect(mocks.createLink).toHaveBeenCalledTimes(20);
    // Inne konto ma własny limit.
    mocks.getCurrentUser.mockResolvedValueOnce({ id: '44444444-4444-4444-8444-444444444444' });
    expect((await actions.createLinkAction(REF)).ok).toBe(true);
  });

  it('złe wejście i brak sesji', async () => {
    expect(await actions.createLinkAction({ clientId: CLIENT_ID })).toEqual({
      ok: false,
      error: t.errors.invalid,
    });
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect(await actions.createLinkAction(REF)).toEqual({ ok: false, error: t.errors.session });
    expect(mocks.createLink).not.toHaveBeenCalled();
  });
});

describe('revokeLinkAction', () => {
  it('wyłącza link po tokenie; cudzy albo nieznany token: „nie ma na Twoim koncie”', async () => {
    expect(await actions.revokeLinkAction({ token: TOKEN })).toEqual({ ok: true });
    expect(mocks.revokeLink).toHaveBeenCalledWith(mocks.db, TOKEN);
    mocks.revokeLink.mockResolvedValueOnce('not-found');
    expect(await actions.revokeLinkAction({ token: TOKEN })).toEqual({ ok: false, error: t.errors.notFound });
  });

  it('token w złym formacie nie trafia do bazy', async () => {
    for (const token of ['krotki', `${TOKEN}x`, `${TOKEN.slice(0, 21)}-`, 42]) {
      expect(await actions.revokeLinkAction({ token })).toEqual({ ok: false, error: t.errors.invalid });
    }
    expect(mocks.revokeLink).not.toHaveBeenCalled();
  });
});

describe('markSentAction i undoSentAction', () => {
  it('zmieniają status i odświeżają listy', async () => {
    expect(await actions.markSentAction(REF)).toEqual({
      ok: true,
      report: { status: 'sent', sentAt: '2026-10-13T10:00:00Z' },
    });
    expect(mocks.markSent).toHaveBeenCalledWith(mocks.db, CLIENT_ID, '2026-09');
    expect(await actions.undoSentAction(REF)).toEqual({
      ok: true,
      report: { status: 'ready', sentAt: null },
    });
    expect(mocks.undoSent).toHaveBeenCalledWith(mocks.db, CLIENT_ID, '2026-09');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/app/klienci');
  });

  it('bez raportu: „nie ma na Twoim koncie”; błąd bazy: przyczyna', async () => {
    mocks.markSent.mockResolvedValueOnce(null);
    expect(await actions.markSentAction(REF)).toEqual({ ok: false, error: t.errors.notFound });
    mocks.undoSent.mockRejectedValueOnce(new Error('timeout'));
    expect(await actions.undoSentAction(REF)).toEqual({ ok: false, error: t.errors.failed });
  });

  it('złe wejście: bez zapytań do bazy', async () => {
    expect(await actions.markSentAction({ clientId: 'x', month: '2026-09' })).toEqual({
      ok: false,
      error: t.errors.invalid,
    });
    expect(await actions.undoSentAction({ ...REF, month: '2026-13' })).toEqual({
      ok: false,
      error: t.errors.invalid,
    });
    expect(await actions.markSentAction({ ...REF, month: '1999-12' })).toEqual({
      ok: false,
      error: t.errors.invalid,
    });
    expect(await actions.createLinkAction({ ...REF, month: '2026-11' })).toEqual({
      ok: false,
      error: t.errors.invalid,
    });
    expect(mocks.markSent).not.toHaveBeenCalled();
    expect(mocks.undoSent).not.toHaveBeenCalled();
  });
});

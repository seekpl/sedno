/**
 * Eksport danych konta: lib/data/account.ts (kształt JSON, bez identyfikatorów z bazy, linki jako pełne
 * adresy, porcje po 1000 wierszy) i trasa GET /app/ustawienia/eksport (sesja, plik do pobrania, no-store,
 * limit). Zapytania idą wyłącznie przez klienta z sesją (RLS) — klucza serwisowego eksport nie używa.
 * Odczyt z prawdziwej bazy z dwoma użytkownikami: tests/db/account-export.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://sedno.example/');

const mocks = vi.hoisted(() => ({
  features: { accounts: true },
  getCurrentUser: vi.fn(),
  db: null as unknown,
}));

vi.mock('@/config/features', () => ({ features: mocks.features }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => mocks.db }));
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => {
    throw new Error('Eksport nie może używać klucza serwisowego.');
  },
}));

const { exportAccount, exportFileName } = await import('@/lib/data/account');
const { GET } = await import('@/app/app/ustawienia/eksport/route');
const { resetRateLimits } = await import('@/lib/server/rate-limit');

const OWNER = '11111111-1111-4111-8111-111111111111';
const CLIENT = '22222222-2222-4222-8222-222222222222';
const REPORT = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';
const NOW = new Date('2026-10-13T21:30:00Z');

type Tables = Record<string, Record<string, unknown>[]>;

/** Klient udający PostgREST: zwraca tylko podane wiersze (tak jak RLS — wyłącznie własne). */
function fakeDb(tables: Tables, profile: Record<string, unknown> | null) {
  const calls: { table: string; range?: [number, number] }[] = [];
  const db = {
    from(table: string) {
      const rows = tables[table] ?? [];
      const builder = {
        select: () => builder,
        order: () => builder,
        eq: () => builder,
        range: (from: number, to: number) => {
          calls.push({ table, range: [from, to] });
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
        maybeSingle: () => {
          calls.push({ table });
          return Promise.resolve({ data: profile, error: null });
        },
      };
      return builder;
    },
  };
  return { db, calls };
}

const DATA = { period: '2026-09', client: { name: 'Studio Lumi' }, actions: { book: 23 } };

const TABLES: Tables = {
  clients: [
    {
      id: CLIENT,
      owner_id: OWNER,
      name: 'Studio Lumi',
      industry: 'salon',
      created_at: '2026-09-01T10:00:00Z',
      archived_at: null,
    },
  ],
  reports: [
    {
      id: REPORT,
      owner_id: OWNER,
      client_id: CLIENT,
      period: '2026-09-01',
      status: 'sent',
      sent_at: '2026-09-27T12:00:00Z',
      created_at: '2026-09-20T12:00:00Z',
      updated_at: '2026-09-27T12:00:00Z',
      data: DATA,
    },
  ],
  share_links: [
    {
      token: TOKEN,
      report_id: REPORT,
      owner_id: OWNER,
      created_at: '2026-09-27T12:00:00Z',
      expires_at: '2027-09-27T12:00:00Z',
      revoked_at: null,
      views: 4,
    },
  ],
};

const PROFILE = {
  display_name: 'Anna',
  brand_name: 'Kadr Social',
  plan: 'free',
  logo_path: `${OWNER}/logo.png`,
  created_at: '2026-09-01T09:00:00Z',
};

beforeEach(() => {
  mocks.features.accounts = true;
  mocks.getCurrentUser.mockReset().mockResolvedValue({ id: OWNER, email: 'anna@example.com' });
  mocks.db = fakeDb(TABLES, PROFILE).db;
  resetRateLimits();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('exportAccount', () => {
  it('profil, klienci, raporty z ReportData i linki jako pełne adresy', async () => {
    const { db } = fakeDb(TABLES, PROFILE);
    const result = await exportAccount(db as never, { email: 'anna@example.com' }, NOW);
    expect(result).toEqual({
      exportedAt: '2026-10-13T21:30:00.000Z',
      profile: {
        email: 'anna@example.com',
        display_name: 'Anna',
        brand_name: 'Kadr Social',
        plan: 'free',
        has_logo: true,
        created_at: '2026-09-01T09:00:00Z',
      },
      clients: [
        { name: 'Studio Lumi', industry: 'salon', created_at: '2026-09-01T10:00:00Z', archived_at: null },
      ],
      reports: [
        {
          client: 'Studio Lumi',
          period: '2026-09',
          status: 'sent',
          sent_at: '2026-09-27T12:00:00Z',
          created_at: '2026-09-20T12:00:00Z',
          updated_at: '2026-09-27T12:00:00Z',
          data: DATA,
        },
      ],
      links: [
        {
          client: 'Studio Lumi',
          period: '2026-09',
          url: `https://sedno.example/r/${TOKEN}`,
          created_at: '2026-09-27T12:00:00Z',
          expires_at: '2027-09-27T12:00:00Z',
          revoked_at: null,
          views: 4,
        },
      ],
    });
  });

  it('bez identyfikatorów z bazy i bez ścieżki logo', async () => {
    const { db } = fakeDb(TABLES, PROFILE);
    const json = JSON.stringify(await exportAccount(db as never, { email: 'a@example.com' }, NOW));
    for (const key of ['"id"', 'owner_id', 'client_id', 'report_id', 'logo_path', '"token"']) {
      expect(json).not.toContain(key);
    }
    expect(json).not.toContain(OWNER);
    expect(json).not.toContain(CLIENT);
    expect(json).not.toContain(REPORT);
  });

  it('pusty profil i brak danych: puste listy, plan darmowy', async () => {
    const { db } = fakeDb({}, null);
    const result = await exportAccount(db as never, {}, NOW);
    expect(result.profile).toEqual({
      email: null,
      display_name: null,
      brand_name: null,
      plan: 'free',
      has_logo: false,
      created_at: null,
    });
    expect(result.clients).toEqual([]);
    expect(result.reports).toEqual([]);
    expect(result.links).toEqual([]);
  });

  it('pobiera wszystkie wiersze porcjami po 1000', async () => {
    const reports = Array.from({ length: 2345 }, (_, i) => ({
      ...TABLES.reports![0],
      id: `r-${i}`,
    }));
    const { db, calls } = fakeDb({ ...TABLES, reports }, PROFILE);
    const result = await exportAccount(db as never, {}, NOW);
    expect(result.reports).toHaveLength(2345);
    expect(calls.filter((c) => c.table === 'reports').map((c) => c.range)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('błąd zapytania: wyjątek bez treści błędu bazy', async () => {
    const failing = {
      from: () => {
        const builder = {
          select: () => builder,
          order: () => builder,
          range: () => Promise.resolve({ data: null, error: { message: 'secret' } }),
          maybeSingle: () => Promise.resolve({ data: PROFILE, error: null }),
        };
        return builder;
      },
    };
    await expect(exportAccount(failing as never, {}, NOW)).rejects.not.toThrow(/secret/);
  });

  it('nazwa pliku z datą w czasie warszawskim', () => {
    expect(exportFileName(NOW)).toBe('sedno-dane-2026-10-13.json');
    expect(exportFileName(new Date('2026-10-13T22:30:00Z'))).toBe('sedno-dane-2026-10-14.json');
  });
});

describe('GET /app/ustawienia/eksport', () => {
  it('plik JSON do pobrania, bez zapisu w pamięci podręcznej', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^application\/json/);
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="sedno-dane-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    const body = (await response.json()) as { profile: { email: string }; reports: unknown[] };
    expect(body.profile.email).toBe('anna@example.com');
    expect(body.reports).toHaveLength(1);
  });

  it('bez sesji: 401 bez danych', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
  });

  it('bez flagi kont: 404', async () => {
    mocks.features.accounts = false;
    expect((await GET()).status).toBe(404);
  });

  it('błąd bazy: 503 bez treści', async () => {
    mocks.db = {
      from: () => {
        throw new Error('secret');
      },
    };
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('');
  });

  it('limit 10 eksportów na minutę na konto', async () => {
    for (let i = 0; i < 10; i++) expect((await GET()).status).toBe(200);
    const limited = await GET();
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
  });
});

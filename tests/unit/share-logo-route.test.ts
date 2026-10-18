/**
 * GET /r/[token]/logo (docs/decisions.md, p. 96): format tokenu przed bazą, limit z IP, logo tylko przez
 * aktywny link, typ z sygnatury, nagłówki (private, nosniff, inline); każda odmowa to ten sam pusty 404.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({ headers: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(Object.fromEntries(h.headers)),
}));

const flags = vi.hoisted(() => ({ accounts: true }));
vi.mock('@/config/features', () => ({
  features: {
    get accounts() {
      return flags.accounts;
    },
  },
}));

const shared = vi.hoisted(() => ({ readSharedLogo: vi.fn() }));
vi.mock('@/lib/data/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/shared')>()),
  readSharedLogo: shared.readSharedLogo,
}));
const admin = vi.hoisted(() => ({ client: { admin: true }, create: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: admin.create }));
vi.mock('@/lib/logo/store', () => ({ readLogo: vi.fn() }));

const { GET } = await import('@/app/r/[token]/logo/route');
const { resetRateLimits } = await import('@/lib/server/rate-limit');

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const request = {} as NextRequest;
const get = (token: string) => GET(request, { params: Promise.resolve({ token }) });

beforeEach(() => {
  flags.accounts = true;
  resetRateLimits();
  h.headers = new Map([['x-forwarded-for', '203.0.113.7']]);
  shared.readSharedLogo.mockReset().mockResolvedValue({ bytes: PNG, contentType: 'image/png' });
  admin.create.mockReset().mockReturnValue(admin.client);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

function expectEmpty404(response: Response) {
  expect(response.status).toBe(404);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('content-type')).toBeNull();
}

describe('GET /r/[token]/logo', () => {
  it('aktywny link z logo → obraz z typem z sygnatury i bezpiecznymi nagłówkami', async () => {
    const response = await get(TOKEN);
    expect(shared.readSharedLogo).toHaveBeenCalledExactlyOnceWith(admin.client, TOKEN);
    expect(response.status).toBe(200);
    expect(Object.fromEntries(response.headers)).toMatchObject({
      'content-type': 'image/png',
      'content-length': String(PNG.byteLength),
      'cache-control': 'private, max-age=300',
      'content-disposition': 'inline',
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-origin',
    });
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...PNG]);
  });

  it('link nieaktywny albo bez logo → pusty 404', async () => {
    shared.readSharedLogo.mockResolvedValue(null);
    expectEmpty404(await get(TOKEN));
  });

  it.each(['krotki', `${TOKEN}x`, '..%2F..%2Fetc', 'AbCdEfGhIjKlMnOpQrSt-_'])(
    'zły token „%s” → 404 bez zapytania',
    async (token) => {
      expectEmpty404(await get(token));
      expect(shared.readSharedLogo).not.toHaveBeenCalled();
    },
  );

  it('120 na minutę z jednego IP, potem 429', async () => {
    for (let i = 0; i < 120; i++) expect((await get(TOKEN)).status).toBe(200);
    const limited = await get(TOKEN);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    expect(shared.readSharedLogo).toHaveBeenCalledTimes(120);
  });

  it('błąd bazy → 503 bez szczegółów', async () => {
    shared.readSharedLogo.mockRejectedValue(new Error('baza'));
    const response = await get(TOKEN);
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('');
  });

  it('bez flagi kont 404', async () => {
    flags.accounts = false;
    expectEmpty404(await get(TOKEN));
    expect(admin.create).not.toHaveBeenCalled();
  });
});

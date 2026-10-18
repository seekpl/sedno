/**
 * GET /app/logo (app/app/logo/route.ts): tylko własne logo zalogowanego użytkownika (ścieżka z profilu
 * przez sesję i RLS), typ z sygnatury, nosniff, private no-cache, ETag i 304; 401 bez sesji, 404 bez logo.
 * Magazyn i baza są podmienione; magazyn na lokalnym stosie sprawdza tests/db/logo-store.test.ts.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  features: { accounts: true },
  getCurrentUser: vi.fn(),
  getLogoPath: vi.fn(),
  readLogo: vi.fn(),
  db: { marker: 'db' },
}));

vi.mock('@/config/features', () => ({ features: mocks.features }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => mocks.db }));
vi.mock('@/lib/data/profile', () => ({ getLogoPath: mocks.getLogoPath }));
vi.mock('@/lib/logo/store', () => ({ readLogo: mocks.readLogo }));

const { GET } = await import('@/app/app/logo/route');

const USER = { id: '11111111-1111-4111-8111-111111111111' };
const PATH = `${USER.id}/logo.png`;
const BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const request = (headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost:3000/app/logo?v=abc', { headers });

beforeEach(() => {
  mocks.features.accounts = true;
  mocks.getCurrentUser.mockReset().mockResolvedValue(USER);
  mocks.getLogoPath.mockReset().mockResolvedValue(PATH);
  mocks.readLogo.mockReset().mockResolvedValue({ bytes: BYTES, contentType: 'image/png' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /app/logo', () => {
  it('zwraca własne logo z typem z sygnatury i bezpiecznymi nagłówkami', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(mocks.getLogoPath).toHaveBeenCalledWith(mocks.db);
    expect(mocks.readLogo).toHaveBeenCalledWith(PATH);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('private, no-cache');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-length')).toBe(String(BYTES.length));
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BYTES);
  });

  it('ETag: ten sam plik → 304 bez treści', async () => {
    const first = await GET(request());
    const etag = first.headers.get('etag');
    expect(etag).toMatch(/^".+"$/);
    const second = await GET(request({ 'if-none-match': etag! }));
    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
  });

  it('bez sesji: 401, bez czytania profilu i magazynu', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(mocks.getLogoPath).not.toHaveBeenCalled();
    expect(mocks.readLogo).not.toHaveBeenCalled();
  });

  it('bez logo: 404', async () => {
    mocks.getLogoPath.mockResolvedValue(null);
    mocks.readLogo.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(404);
  });

  it('bez flagi kont: 404', async () => {
    mocks.features.accounts = false;
    expect((await GET(request())).status).toBe(404);
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it('błąd bazy: 503', async () => {
    mocks.getLogoPath.mockRejectedValue(new Error('secret'));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

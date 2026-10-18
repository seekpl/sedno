/**
 * Trasy logowania: GET /auth/potwierdz (wymiana kodu PKCE na sesję, powrót tylko do /app, każdy błąd →
 * /logowanie?blad=link) i POST /auth/wyloguj (koniec sesji, usunięte ciasteczka, 303 na /; inne metody 405).
 * Bez flagi kont obie trasy dają 404.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const flags = vi.hoisted(() => ({ accounts: true }));
vi.mock('@/config/features', () => ({
  features: {
    get accounts() {
      return flags.accounts;
    },
  },
}));

const supabase = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  signOut: vi.fn(),
  create: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: supabase.create }));

const jar = vi.hoisted(() => ({ cookies: new Map<string, string>(), deleted: [] as string[] }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...jar.cookies].map(([name, value]) => ({ name, value })),
    delete: (name: string) => {
      jar.deleted.push(name);
      jar.cookies.delete(name);
    },
  }),
}));

const confirm = await import('@/app/auth/potwierdz/route');
const logout = await import('@/app/auth/wyloguj/route');

const CODE = '6a1f3b0c-2d4e-4f5a-8b9c-0d1e2f3a4b5c';
const get = (query: string) => confirm.GET(new NextRequest(`http://localhost:3100/auth/potwierdz${query}`));

beforeEach(() => {
  flags.accounts = true;
  supabase.exchangeCodeForSession.mockReset().mockResolvedValue({ data: {}, error: null });
  supabase.signOut.mockReset().mockResolvedValue({ error: null });
  supabase.create.mockReset().mockImplementation(async () => ({
    auth: { exchangeCodeForSession: supabase.exchangeCodeForSession, signOut: supabase.signOut },
  }));
  jar.cookies = new Map();
  jar.deleted = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

function expectRedirect(response: Response, location: string) {
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe(location);
  expect(response.headers.get('cache-control')).toBe('no-store');
}

describe('GET /auth/potwierdz', () => {
  it('wymienia kod na sesję i wraca na ścieżkę z ?next=', async () => {
    const response = await get(`?next=${encodeURIComponent('/app/klienci/abc/2026-09?krok=2')}&code=${CODE}`);
    expect(supabase.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith(CODE);
    expectRedirect(response, '/app/klienci/abc/2026-09?krok=2');
  });

  it.each([
    ['', '/app/klienci'],
    [`&next=${encodeURIComponent('https://zly.example/app')}`, '/app/klienci'],
    [`&next=${encodeURIComponent('//zly.example')}`, '/app/klienci'],
    [`&next=${encodeURIComponent('/r/abc')}`, '/app/klienci'],
  ])('ścieżka powrotu tylko w /app (%s → %s)', async (next, location) => {
    expectRedirect(await get(`?code=${CODE}${next}`), location);
  });

  it.each([
    ['bez kodu', ''],
    ['błąd z Supabase Auth', '?error=access_denied&error_code=otp_expired'],
    ['błąd i kod naraz', `?error=access_denied&code=${CODE}`],
    ['kod z niedozwolonymi znakami', `?code=${encodeURIComponent('abc<script>defgh')}`],
    ['za krótki kod', '?code=abc'],
  ])('%s → /logowanie?blad=link, bez wymiany', async (_label, query) => {
    expectRedirect(await get(query), '/logowanie?blad=link');
    expect(supabase.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('nieudana wymiana (link wygasł, inna przeglądarka) → /logowanie?blad=link', async () => {
    supabase.exchangeCodeForSession.mockResolvedValue({
      data: {},
      error: { status: 400, code: 'flow_state_not_found', message: 'invalid flow state' },
    });
    expectRedirect(await get(`?code=${CODE}`), '/logowanie?blad=link');
  });

  it('wyjątek przy wymianie → /logowanie?blad=link', async () => {
    supabase.exchangeCodeForSession.mockRejectedValue(new Error('sieć'));
    expectRedirect(await get(`?code=${CODE}`), '/logowanie?blad=link');
  });

  it('bez flagi kont 404', async () => {
    flags.accounts = false;
    const response = await get(`?code=${CODE}`);
    expect(response.status).toBe(404);
    expect(supabase.create).not.toHaveBeenCalled();
  });
});

describe('POST /auth/wyloguj', () => {
  it('kończy tę sesję, usuwa ciasteczka sesji i przekierowuje 303 na stronę główną', async () => {
    jar.cookies = new Map([
      ['sb-127-auth-token', 'a'],
      ['sb-127-auth-token.0', 'b'],
      ['sb-127-auth-token-code-verifier', 'c'],
      ['inne', 'zostaje'],
    ]);
    const response = await logout.POST();
    expect(supabase.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
    expectRedirect(response, '/');
    expect(jar.deleted.sort()).toEqual([
      'sb-127-auth-token',
      'sb-127-auth-token-code-verifier',
      'sb-127-auth-token.0',
    ]);
    expect([...jar.cookies.keys()]).toEqual(['inne']);
  });

  it('gdy Supabase nie odpowiada, ciasteczka i tak znikają', async () => {
    jar.cookies = new Map([['sb-127-auth-token', 'a']]);
    supabase.signOut.mockRejectedValue(new Error('sieć'));
    expectRedirect(await logout.POST(), '/');
    expect(jar.cookies.size).toBe(0);
  });

  it.each(['GET', 'PUT', 'PATCH', 'DELETE'] as const)('%s → 405 z Allow: POST', async (method) => {
    const response = await logout[method]();
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(supabase.signOut).not.toHaveBeenCalled();
  });

  it('bez flagi kont 404', async () => {
    flags.accounts = false;
    expect((await logout.POST()).status).toBe(404);
    expect((await logout.GET()).status).toBe(404);
    expect(supabase.create).not.toHaveBeenCalled();
  });
});

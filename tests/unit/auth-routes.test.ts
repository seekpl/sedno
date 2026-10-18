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
/** POST formularza wylogowania; `site` to nagłówek Sec-Fetch-Site przeglądarki (brak — stara przeglądarka). */
const post = (site?: string) =>
  logout.POST(
    new NextRequest('http://localhost:3100/auth/wyloguj', {
      method: 'POST',
      headers: site ? { 'sec-fetch-site': site } : {},
    }),
  );

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

  it('po zalogowaniu usuwa zbędne weryfikatory PKCE, a ciasteczka sesji zostawia', async () => {
    jar.cookies = new Map([
      ['sb-127-auth-token', 'sesja'],
      ['sb-127-auth-token.1', 'sesja-cz-2'],
      ['sb-127-auth-token-code-verifier', 'a'],
      ['sb-127-auth-token-flow-0123456789abcdef-code-verifier', 'b'],
      ['sb-127-auth-token-flows-code-verifier', 'c'],
      ['inne', 'zostaje'],
    ]);
    expectRedirect(await get(`?code=${CODE}`), '/app/klienci');
    expect(jar.deleted.sort()).toEqual([
      'sb-127-auth-token-code-verifier',
      'sb-127-auth-token-flow-0123456789abcdef-code-verifier',
      'sb-127-auth-token-flows-code-verifier',
    ]);
    expect([...jar.cookies.keys()]).toEqual(['sb-127-auth-token', 'sb-127-auth-token.1', 'inne']);
  });

  it('nieudana wymiana nie usuwa weryfikatorów (np. drugi link w tej samej przeglądarce)', async () => {
    jar.cookies = new Map([['sb-127-auth-token-flow-0123456789abcdef-code-verifier', 'b']]);
    supabase.exchangeCodeForSession.mockResolvedValue({
      data: {},
      error: { status: 400, code: 'flow_state_not_found', message: 'invalid flow state' },
    });
    expectRedirect(await get(`?code=${CODE}`), '/logowanie?blad=link');
    expect(jar.deleted).toEqual([]);
  });

  it('znaki spoza ASCII w ?next= są zakodowane w nagłówku Location', async () => {
    const response = await get(`?code=${CODE}&next=${encodeURIComponent('/app/klienci/żółw ą')}`);
    expectRedirect(response, `/app/klienci/${encodeURIComponent('żółw')}%20${encodeURIComponent('ą')}`);
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
    const response = await post('same-origin');
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
    expectRedirect(await post('same-origin'), '/');
    expect(jar.cookies.size).toBe(0);
  });

  it('przeglądarka bez Sec-Fetch-Site też może się wylogować', async () => {
    jar.cookies = new Map([['sb-127-auth-token', 'a']]);
    expectRedirect(await post(), '/');
    expect(jar.cookies.size).toBe(0);
  });

  it.each(['cross-site', 'same-site'])(
    'formularz z innej witryny (Sec-Fetch-Site: %s) → 403, sesja zostaje',
    async (site) => {
      jar.cookies = new Map([['sb-127-auth-token', 'a']]);
      const response = await post(site);
      expect(response.status).toBe(403);
      expect(supabase.signOut).not.toHaveBeenCalled();
      expect(jar.deleted).toEqual([]);
    },
  );

  it.each(['GET', 'PUT', 'PATCH', 'DELETE'] as const)('%s → 405 z Allow: POST', async (method) => {
    const response = await logout[method]();
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(supabase.signOut).not.toHaveBeenCalled();
  });

  it('bez flagi kont 404', async () => {
    flags.accounts = false;
    expect((await post('same-origin')).status).toBe(404);
    expect((await logout.GET()).status).toBe(404);
    expect(supabase.create).not.toHaveBeenCalled();
  });
});

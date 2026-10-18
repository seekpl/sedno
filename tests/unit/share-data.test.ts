/**
 * lib/data/shared.ts bez bazy (klient Supabase podmieniony): format tokenu przed zapytaniem, limit 60 otwarć
 * na minutę z IP, schemat raportu (obrona w głąb), błąd bazy ≠ „wygasł”, flaga kont, logo tylko przez
 * aktywny link — i React cache(): metadane i strona w jednym żądaniu to jedno wywołanie (jedno wyświetlenie).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLE_REPORT } from '@/lib/report/example';

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

const sb = vi.hoisted(() => ({ rpc: vi.fn(), createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: sb.createClient }));

const logo = vi.hoisted(() => ({ readLogo: vi.fn() }));
vi.mock('@/lib/logo/store', () => logo);

/**
 * React cache() poza renderowaniem serwera nic nie pamięta (wersja kliencka Reacta), więc tu podmieniamy go
 * na pamięć „jednego żądania”, którą test zeruje. Sprawdzamy, że getSharedReport jest przez nią opakowane.
 */
const requestCache = vi.hoisted(() => ({ stores: [] as Map<unknown, unknown>[], wrapped: [] as unknown[] }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
    requestCache.wrapped.push(fn);
    const store = new Map<unknown, unknown>();
    requestCache.stores.push(store);
    return (...args: A): R => {
      const key = JSON.stringify(args);
      if (!store.has(key)) store.set(key, fn(...args));
      return store.get(key) as R;
    };
  },
}));

const shared = await import('@/lib/data/shared');
const { resetRateLimits } = await import('@/lib/server/rate-limit');

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';
const OK = { data: EXAMPLE_REPORT, branding: 'sedno-footer', hasLogo: false };

const newRequest = () => requestCache.stores.forEach((store) => store.clear());

beforeEach(() => {
  flags.accounts = true;
  resetRateLimits();
  newRequest();
  h.headers = new Map([['x-forwarded-for', '203.0.113.7']]);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'klucz-anon');
  sb.rpc.mockReset().mockResolvedValue({ data: OK, error: null });
  sb.createClient.mockReset().mockImplementation(() => ({ rpc: sb.rpc }));
  logo.readLogo.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('token', () => {
  it.each([
    [TOKEN, true],
    ['0123456789abcdefghijkl', true],
    ['AbCdEfGhIjKlMnOpQrStU', false],
    ['AbCdEfGhIjKlMnOpQrStUvW', false],
    ['AbCdEfGhIjKlMnOpQrSt-_', false],
    ["AbCdEfGhIjKlMnOpQr'--x", false],
    ['', false],
    [null, false],
  ])('%s → %s', (token, ok) => {
    expect(shared.isShareToken(token)).toBe(ok);
  });

  it('zły format: brak zapytania do bazy i brak limitu', async () => {
    for (const token of ['krotki', `${TOKEN}x`, '../../etc/passwd', 'AbCdEfGhIjKlMnOpQrSt%20']) {
      expect(await shared.loadSharedReport(token)).toEqual({ status: 'not-found' });
    }
    expect(sb.rpc).not.toHaveBeenCalled();
    expect(sb.createClient).not.toHaveBeenCalled();
  });
});

describe('loadSharedReport', () => {
  it('poprawny link: get_shared_report kluczem anon bez sesji, dane po schemacie', async () => {
    const result = await shared.loadSharedReport(TOKEN);
    expect(result).toEqual({ status: 'ok', ...OK });
    expect(sb.rpc).toHaveBeenCalledExactlyOnceWith('get_shared_report', { p_token: TOKEN });
    const [url, key, options] = sb.createClient.mock.calls[0] as [string, string, { auth: object }];
    expect([url, key]).toEqual(['http://127.0.0.1:54321', 'klucz-anon']);
    expect(options.auth).toEqual({
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    });
  });

  it('adres logo zapisany w danych (author.logoUrl) pomija — logo tylko przez /r/{token}/logo', async () => {
    const author = { name: 'Kadr Social', logoUrl: 'https://sledzenie.example/piksel.png' };
    sb.rpc.mockResolvedValue({ data: { ...OK, data: { ...EXAMPLE_REPORT, author } }, error: null });
    const result = await shared.loadSharedReport(TOKEN);
    expect(result).toEqual({
      status: 'ok',
      ...OK,
      data: { ...EXAMPLE_REPORT, author: { name: 'Kadr Social' } },
    });
    expect(JSON.stringify(result)).not.toContain('sledzenie.example');
  });

  it('link wygasły, odwołany albo nieznany (null z bazy) → not-found', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: null });
    expect(await shared.loadSharedReport(TOKEN)).toEqual({ status: 'not-found' });
  });

  it('dane niezgodne ze schematem → not-found, w logu bez treści raportu', async () => {
    sb.rpc.mockResolvedValue({
      data: { ...OK, data: { ...EXAMPLE_REPORT, description: 'SEDNO-PRIVACY-CANARY-7f3a' } },
      error: null,
    });
    expect(await shared.loadSharedReport(TOKEN)).toEqual({ status: 'not-found' });
    const logged = vi.mocked(console.error).mock.calls.flat().map(String).join(' ');
    expect(logged).not.toContain('SEDNO-PRIVACY-CANARY-7f3a');
    expect(logged).not.toContain(EXAMPLE_REPORT.client.name);
  });

  it('nieznany branding albo brak hasLogo → not-found', async () => {
    sb.rpc.mockResolvedValue({ data: { ...OK, branding: 'inne' }, error: null });
    expect((await shared.loadSharedReport(TOKEN)).status).toBe('not-found');
    sb.rpc.mockResolvedValue({ data: { data: EXAMPLE_REPORT, branding: 'author' }, error: null });
    expect((await shared.loadSharedReport(TOKEN)).status).toBe('not-found');
  });

  it('błąd bazy rzuca wyjątek (strona błędu), a nie „raport niedostępny”', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: { message: 'timeout', code: '57014' } });
    await expect(shared.loadSharedReport(TOKEN)).rejects.toThrow('Odczyt raportu z linku nie powiódł się.');
  });

  it('60 otwarć na minutę z jednego IP, potem rate-limited; inny IP działa', async () => {
    for (let i = 0; i < 60; i++) expect((await shared.loadSharedReport(TOKEN)).status).toBe('ok');
    expect(await shared.loadSharedReport(TOKEN)).toEqual({ status: 'rate-limited' });
    expect(sb.rpc).toHaveBeenCalledTimes(60);
    h.headers = new Map([['x-forwarded-for', '198.51.100.1']]);
    expect((await shared.loadSharedReport(TOKEN)).status).toBe('ok');
  });

  it.each([
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'facebookexternalhit/1.1 Facebot Twitterbot/1.0',
    'WhatsApp/2.23.20.0 A',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'TelegramBot (like TwitterBot)',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36 Edg/119 MicrosoftPreview/2.0 +https://aka.ms/MicrosoftPreview',
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  ])('robot podglądu linku „%s” → preview: bez bazy, bez wyświetlenia i bez limitu', async (ua) => {
    h.headers.set('user-agent', ua);
    expect(await shared.loadSharedReport(TOKEN)).toEqual({ status: 'preview' });
    expect(sb.rpc).not.toHaveBeenCalled();
    expect(sb.createClient).not.toHaveBeenCalled();
  });

  it.each([
    // Przeglądarki ludzi, także wbudowane w aplikacje (Facebook, Instagram, LinkedIn, Telegram, WhatsApp).
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0]',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 340.0',
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 LinkedInApp',
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 Telegram-Android/11.0',
    'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 WhatsApp/2.24',
  ])('przeglądarka człowieka „%s” → raport i wyświetlenie', async (ua) => {
    h.headers.set('user-agent', ua);
    expect((await shared.loadSharedReport(TOKEN)).status).toBe('ok');
    expect(sb.rpc).toHaveBeenCalledOnce();
  });

  it('bez flagi kont → not-found bez zapytania', async () => {
    flags.accounts = false;
    expect(await shared.loadSharedReport(TOKEN)).toEqual({ status: 'not-found' });
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});

describe('getSharedReport (React cache)', () => {
  it('jest loadSharedReport opakowanym w cache()', () => {
    expect(requestCache.wrapped).toContain(shared.loadSharedReport);
  });

  it('w jednym żądaniu jedno zapytanie (jedno wyświetlenie), w kolejnym — następne', async () => {
    const [a, b] = await Promise.all([shared.getSharedReport(TOKEN), shared.getSharedReport(TOKEN)]);
    expect(a).toBe(b);
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    newRequest();
    await shared.getSharedReport(TOKEN);
    expect(sb.rpc).toHaveBeenCalledTimes(2);
  });

  it('metadane z układu i strona dzielą jedno wywołanie', async () => {
    vi.doMock('next/navigation', () => ({ notFound: vi.fn() }));
    vi.doMock('next/server', () => ({ after: vi.fn() }));
    vi.doMock('@/lib/server/server-events', () => ({ recordServerEvent: vi.fn() }));
    const [{ generateMetadata }, { default: Page }] = await Promise.all([
      import('@/app/r/[token]/layout'),
      import('@/app/r/[token]/page'),
    ]);
    const params = Promise.resolve({ token: TOKEN });
    await Promise.all([generateMetadata({ params }), Page({ params })]);
    expect(sb.rpc).toHaveBeenCalledTimes(1);
  });
});

describe('logo przez aktywny link', () => {
  /** Klient serwisowy z łańcuchem zapytań PostgREST zapisującym warunki. */
  function adminFake(link: { owner_id: string } | null, logoPath: string | null) {
    const filters: unknown[][] = [];
    const query = (table: string) => {
      const chain = {
        select: () => chain,
        eq: (...args: unknown[]) => (filters.push([table, 'eq', ...args]), chain),
        is: (...args: unknown[]) => (filters.push([table, 'is', ...args]), chain),
        gt: (...args: unknown[]) => (filters.push([table, 'gt', ...args]), chain),
        maybeSingle: async () => ({
          data: table === 'share_links' ? link : { logo_path: logoPath },
          error: null,
        }),
      };
      return chain;
    };
    return { db: { from: query } as never, filters };
  }

  it('aktywny link → ścieżka logo właściciela; warunki: token, nieodwołany, nieprzeterminowany', async () => {
    const { db, filters } = adminFake({ owner_id: 'wlasciciel' }, 'wlasciciel/logo.png');
    const now = new Date('2026-10-13T08:00:00Z');
    expect(await shared.findSharedLogoPath(db, TOKEN, now)).toBe('wlasciciel/logo.png');
    expect(filters).toEqual([
      ['share_links', 'eq', 'token', TOKEN],
      ['share_links', 'is', 'revoked_at', null],
      ['share_links', 'gt', 'expires_at', now.toISOString()],
      ['profiles', 'eq', 'id', 'wlasciciel'],
    ]);
  });

  it('brak aktywnego linku albo zły token → null bez odczytu pliku', async () => {
    const { db } = adminFake(null, 'x/logo.png');
    expect(await shared.readSharedLogo(db, TOKEN)).toBeNull();
    expect(await shared.readSharedLogo(db, 'zly')).toBeNull();
    expect(logo.readLogo).not.toHaveBeenCalled();
  });

  it('właściciel bez logo → null', async () => {
    const { db } = adminFake({ owner_id: 'wlasciciel' }, null);
    expect(await shared.readSharedLogo(db, TOKEN)).toBeNull();
    expect(logo.readLogo).not.toHaveBeenCalled();
  });
});

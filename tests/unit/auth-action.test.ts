/**
 * Server Action requestMagicLink (PROMPT.md §10, §15): walidacja zod, limity (IP i skrót adresu), adres
 * powrotu z safeNextPath, „Wyślij ponownie” i „Użyj innego adresu”, błędy dostawcy — i nigdzie adresu e-mail
 * w logach ani w kluczach limitów.
 */
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth as t } from '@/lib/copy/auth';

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

const supabase = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  create: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: supabase.create }));

const keys = vi.hoisted(() => ({ seen: [] as string[] }));
vi.mock('@/lib/server/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/rate-limit')>();
  return {
    ...actual,
    rateLimit: (key: string, limit: number, windowMs: number, now?: number) => {
      keys.seen.push(key);
      return actual.rateLimit(key, limit, windowMs, now);
    },
  };
});

const { requestMagicLink } = await import('@/app/logowanie/actions');
type LoginState = Awaited<ReturnType<typeof requestMagicLink>>;
const { resetRateLimits } = await import('@/lib/server/rate-limit');

const IDLE: LoginState = { status: 'idle' };
const SITE = 'https://sedno.example';

function form(fields: Record<string, string | undefined>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) data.append(key, value);
  return data;
}

const send = (email: string | undefined, extra: Record<string, string | undefined> = {}) =>
  requestMagicLink(IDLE, form({ email, intent: 'send', next: '/app/klienci', ...extra }));

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  flags.accounts = true;
  resetRateLimits();
  keys.seen = [];
  h.headers = new Map([['x-forwarded-for', '203.0.113.7']]);
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', SITE);
  supabase.signInWithOtp.mockReset();
  supabase.signInWithOtp.mockResolvedValue({ data: {}, error: null });
  supabase.create.mockReset();
  supabase.create.mockImplementation(async () => ({ auth: { signInWithOtp: supabase.signInWithOtp } }));
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** Żaden wpis w logu nie zawiera adresu (ani jego części przed @). */
function expectNoEmailInLogs(email: string) {
  const logged = errorLog.mock.calls.flat().map(String).join('\n');
  expect(logged).not.toContain(email);
  expect(logged).not.toContain(email.split('@')[0]);
}

describe('requestMagicLink — walidacja', () => {
  it('pusty adres → błąd pola, bez wysyłki', async () => {
    const state = await send('   ');
    expect(state).toEqual({ status: 'idle', email: '', fieldError: t.errors.emailRequired });
    expect(supabase.signInWithOtp).not.toHaveBeenCalled();
  });

  it('brak pola e-mail → błąd pola', async () => {
    const state = await send(undefined);
    expect(state).toMatchObject({ status: 'idle', fieldError: t.errors.emailRequired });
  });

  it.each(['ala', 'ala@', 'ala@firma', 'zażółć@firma.pl', 'ala @firma.pl'])(
    'nieprawidłowy adres „%s” → błąd pola z naprawą',
    async (email) => {
      const state = await send(email);
      expect(state).toMatchObject({ status: 'idle', fieldError: t.errors.emailInvalid });
      expect(supabase.signInWithOtp).not.toHaveBeenCalled();
    },
  );

  it('adres dłuższy niż 254 znaki → błąd długości', async () => {
    const state = await send(`${'a'.repeat(250)}@firma.pl`);
    expect(state).toMatchObject({ status: 'idle', fieldError: t.errors.emailTooLong });
  });

  it('bez flagi kont nic nie wysyła (strona daje 404, a identyfikator akcji jest w paczce)', async () => {
    flags.accounts = false;
    expect(await send('ala@firma.pl')).toEqual({ status: 'idle', message: t.errors.failed });
    expect(supabase.create).not.toHaveBeenCalled();
    expect(keys.seen).toEqual([]);
  });

  it('nieprawidłowe wejście nie zużywa limitu', async () => {
    for (let i = 0; i < 10; i++) await send('zły adres');
    expect(keys.seen).toEqual([]);
    expect((await send('ala@firma.pl')).status).toBe('sent');
  });
});

describe('requestMagicLink — wysyłka', () => {
  it('normalizuje adres i wysyła link PKCE z powrotem na /auth/potwierdz?next=…', async () => {
    const state = await send('  Ala@Firma.PL ', { next: '/app/klienci/abc/2026-09?krok=2' });
    expect(state).toEqual({ status: 'sent', email: 'ala@firma.pl' });
    expect(supabase.signInWithOtp).toHaveBeenCalledExactlyOnceWith({
      email: 'ala@firma.pl',
      options: {
        emailRedirectTo: `${SITE}/auth/potwierdz?next=${encodeURIComponent('/app/klienci/abc/2026-09?krok=2')}`,
        shouldCreateUser: true,
      },
    });
  });

  it.each([
    ['https://zly.example/app', '/app/klienci'],
    ['//zly.example/app', '/app/klienci'],
    ['/app//zly.example', '/app/klienci'],
    ['/nowy', '/app/klienci'],
    [undefined, '/app/klienci'],
    ['/app/raporty?strona=2', '/app/raporty?strona=2'],
  ])('ścieżka powrotu %s → %s (safeNextPath)', async (next, expected) => {
    await send('ala@firma.pl', { next });
    const [[call]] = supabase.signInWithOtp.mock.calls as [[{ options: { emailRedirectTo: string } }]];
    expect(call.options.emailRedirectTo).toBe(`${SITE}/auth/potwierdz?next=${encodeURIComponent(expected)}`);
  });

  it('bez NEXT_PUBLIC_SITE_URL adres lokalny', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    await send('ala@firma.pl');
    const [[call]] = supabase.signInWithOtp.mock.calls as [[{ options: { emailRedirectTo: string } }]];
    expect(call.options.emailRedirectTo).toBe('http://localhost:3000/auth/potwierdz?next=%2Fapp%2Fklienci');
  });

  it('„Wyślij ponownie” → ten sam ekran z informacją o nowym linku', async () => {
    const state = await requestMagicLink(
      { status: 'sent', email: 'ala@firma.pl' },
      form({ email: 'ala@firma.pl', intent: 'resend', next: '/app/klienci' }),
    );
    expect(state).toEqual({ status: 'sent', email: 'ala@firma.pl', resent: true });
    expect(supabase.signInWithOtp).toHaveBeenCalledOnce();
  });

  it('„Użyj innego adresu” → pusty formularz, bez wysyłki i bez limitu', async () => {
    const state = await requestMagicLink(
      { status: 'sent', email: 'ala@firma.pl' },
      form({ email: 'ala@firma.pl', intent: 'change' }),
    );
    expect(state).toEqual({ status: 'idle' });
    expect(supabase.signInWithOtp).not.toHaveBeenCalled();
    expect(keys.seen).toEqual([]);
  });

  it('nieznane działanie traktuje jak wysyłkę', async () => {
    const state = await send('ala@firma.pl', { intent: 'cokolwiek' });
    expect(state.status).toBe('sent');
  });
});

describe('requestMagicLink — limity', () => {
  it('5 próśb na 10 minut z jednego IP, potem komunikat z przyczyną i naprawą', async () => {
    for (let i = 0; i < 5; i++) expect((await send(`osoba${i}@firma.pl`)).status).toBe('sent');
    const blocked = await send('osoba9@firma.pl');
    expect(blocked).toEqual({ status: 'idle', email: 'osoba9@firma.pl', message: t.errors.rateLimitedIp });
    expect(supabase.signInWithOtp).toHaveBeenCalledTimes(5);

    h.headers = new Map([['x-forwarded-for', '198.51.100.1']]);
    expect((await send('osoba9@firma.pl')).status).toBe('sent');
  });

  it('3 prośby na 10 minut na jeden adres (bez względu na wielkość liter i IP)', async () => {
    for (let i = 0; i < 3; i++) {
      h.headers = new Map([['x-forwarded-for', `198.51.100.${i + 1}`]]);
      expect((await send(i === 1 ? 'ALA@firma.pl' : 'ala@firma.pl')).status).toBe('sent');
    }
    h.headers = new Map([['x-forwarded-for', '198.51.100.99']]);
    const blocked = await send('ala@firma.pl');
    expect(blocked).toMatchObject({ status: 'idle', message: t.errors.rateLimitedEmail });
    expect(supabase.signInWithOtp).toHaveBeenCalledTimes(3);
  });

  it('limit przy „Wyślij ponownie” zostaje na ekranie „Sprawdź skrzynkę”', async () => {
    for (let i = 0; i < 3; i++) await send('ala@firma.pl');
    const state = await requestMagicLink(
      { status: 'sent', email: 'ala@firma.pl' },
      form({ email: 'ala@firma.pl', intent: 'resend' }),
    );
    expect(state).toEqual({ status: 'sent', email: 'ala@firma.pl', message: t.errors.rateLimitedEmail });
  });

  it('klucz limitu adresu to skrót SHA-256, nigdy sam adres', async () => {
    await send('ala@firma.pl');
    const hash = createHash('sha256').update('ala@firma.pl').digest('hex');
    expect(keys.seen).toEqual(['login-ip:203.0.113.7', `login-email:${hash}`]);
    expect(keys.seen.join(' ')).not.toContain('ala');
  });
});

describe('requestMagicLink — błędy dostawcy', () => {
  it('limit Supabase (429) → komunikat „odczekaj minutę”, w logu tylko kod', async () => {
    supabase.signInWithOtp.mockResolvedValue({
      data: {},
      error: { status: 429, code: 'over_email_send_rate_limit', message: 'ala@firma.pl rate limited' },
    });
    const state = await send('ala@firma.pl');
    expect(state).toEqual({ status: 'idle', email: 'ala@firma.pl', message: t.errors.providerRateLimited });
    expect(errorLog).toHaveBeenCalledOnce();
    expect(String(errorLog.mock.calls[0]?.[0])).toContain('over_email_send_rate_limit');
    expectNoEmailInLogs('ala@firma.pl');
  });

  it('adres odrzucony przez Supabase → błąd pola', async () => {
    supabase.signInWithOtp.mockResolvedValue({
      data: {},
      error: {
        status: 400,
        code: 'email_address_invalid',
        message: 'Email address "ala@firma.pl" is invalid',
      },
    });
    expect(await send('ala@firma.pl')).toEqual({
      status: 'idle',
      email: 'ala@firma.pl',
      fieldError: t.errors.emailInvalid,
    });
    expectNoEmailInLogs('ala@firma.pl');
  });

  it('inny błąd → uczciwy komunikat z naprawą', async () => {
    supabase.signInWithOtp.mockResolvedValue({
      data: {},
      error: { status: 500, code: 'unexpected_failure', message: 'smtp failed for ala@firma.pl' },
    });
    expect(await send('ala@firma.pl')).toEqual({
      status: 'idle',
      email: 'ala@firma.pl',
      message: t.errors.failed,
    });
    expectNoEmailInLogs('ala@firma.pl');
  });

  it('wyjątek (np. brak konfiguracji Supabase) → komunikat, bez rzucania i bez adresu w logu', async () => {
    supabase.create.mockRejectedValue(new Error('Brak konfiguracji dla ala@firma.pl'));
    expect(await send('ala@firma.pl')).toEqual({ status: 'idle', message: t.errors.failed });
    expectNoEmailInLogs('ala@firma.pl');
  });

  it('odpowiedź jest taka sama dla nowego i znanego adresu (shouldCreateUser, bez rozróżnienia)', async () => {
    const a = await send('nowy@firma.pl');
    const b = await send('znany@firma.pl');
    expect(a).toEqual({ status: 'sent', email: 'nowy@firma.pl' });
    expect(b).toEqual({ status: 'sent', email: 'znany@firma.pl' });
  });
});

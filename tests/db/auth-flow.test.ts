/**
 * Cały przepływ logowania na prawdziwym Supabase Auth lokalnego stosu przez kod aplikacji, bez serwera
 * Next.js: Server Action requestMagicLink (klient serwera z @supabase/ssr, weryfikator PKCE w ciasteczku
 * httpOnly) → e-mail w Mailpit → /auth/v1/verify → GET /auth/potwierdz (wymiana kodu, ciasteczka sesji,
 * 303 na ?next=) → sesja widoczna dla klienta serwera → POST /auth/wyloguj (ciasteczka usunięte).
 * Ciasteczka jednej „przeglądarki” to słoik w pamięci podstawiony pod next/headers.
 */
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANON_KEY, MAILPIT_URL, SITE_URL, SUPABASE_URL } from '../../scripts/local-supabase/config';
import { deleteUser, sql } from './helpers';

type CookieOptions = { httpOnly?: boolean; sameSite?: string | boolean; path?: string; maxAge?: number };
type Jar = Map<string, { value: string; options: CookieOptions }>;

const browser = vi.hoisted(() => ({ jar: new Map() as Jar, ip: '198.51.100.10' }));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': browser.ip }),
  cookies: async () => ({
    getAll: () => [...browser.jar].map(([name, { value }]) => ({ name, value })),
    get: (name: string) => {
      const cookie = browser.jar.get(name);
      return cookie ? { name, value: cookie.value } : undefined;
    },
    set: (name: string, value: string, options: CookieOptions = {}) => {
      // Ciasteczko z maxAge 0 albo pustą wartością przeglądarka usuwa.
      if (options.maxAge === 0 || value === '') browser.jar.delete(name);
      else browser.jar.set(name, { value, options });
    },
    delete: (name: string) => void browser.jar.delete(name),
  }),
}));

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('NEXT_PUBLIC_ACCOUNTS_ENABLED', 'true');
vi.stubEnv('NEXT_PUBLIC_SITE_URL', SITE_URL);

const { requestMagicLink } = await import('@/app/logowanie/actions');
const { GET: confirm } = await import('@/app/auth/potwierdz/route');
const { POST: logout } = await import('@/app/auth/wyloguj/route');
const { createSupabaseServerClient } = await import('@/lib/supabase/server');
const { resetRateLimits } = await import('@/lib/server/rate-limit');

const users: string[] = [];

afterAll(async () => {
  for (const id of users) await deleteUser(id);
});

beforeEach(() => {
  resetRateLimits();
  browser.jar = new Map();
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/** Link /auth/v1/verify z najnowszej wiadomości do `email` wysłanej po `since`. */
async function waitForLink(email: string, since: Date): Promise<{ subject: string; link: string }> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const { messages } = (await search.json()) as { messages: { ID: string; Created: string }[] };
    const fresh = messages.find((m) => new Date(m.Created).getTime() >= since.getTime() - 1000);
    if (fresh) {
      const message = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${fresh.ID}`)).json()) as {
        Subject: string;
        HTML: string;
      };
      const link = /https?:\/\/[^\s"'<>)]+\/auth\/v1\/verify\?[^\s"'<>)]+/.exec(message.HTML)?.[0];
      if (!link) throw new Error('Brak linku /auth/v1/verify w wiadomości');
      return { subject: message.Subject, link: link.replaceAll('&amp;', '&') };
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Nie przyszedł e-mail z linkiem');
}

/** Kliknięcie w link z e-maila: /auth/v1/verify przekierowuje na {SITE_URL}/auth/potwierdz?…code=… */
async function clickEmailLink(link: string): Promise<URL> {
  const response = await fetch(link, { redirect: 'manual' });
  return new URL(response.headers.get('location') ?? '');
}

const sessionCookies = () =>
  [...browser.jar.keys()].filter((name) => /^sb-.+-auth-token(\.\d+)?$/.test(name));
const verifierCookies = () => [...browser.jar.keys()].filter((name) => name.endsWith('-code-verifier'));

describe('logowanie przez kod aplikacji (Server Action i trasy) na lokalnym Supabase Auth', () => {
  it('prośba o link → e-mail Sedno → /auth/potwierdz ustawia sesję i wraca na next → wylogowanie', async () => {
    const email = `flow-${randomUUID()}@example.com`;
    const next = '/app/klienci?m=2026-09';
    const since = new Date();

    const state = await requestMagicLink(
      { status: 'idle' },
      form({ intent: 'send', email: email.toUpperCase(), next }),
    );
    expect(state).toEqual({ status: 'sent', email });

    // Weryfikator PKCE jest w ciasteczku httpOnly tej przeglądarki (JavaScript strony go nie widzi).
    const [verifier] = verifierCookies();
    expect(verifier).toBeDefined();
    expect(browser.jar.get(verifier!)?.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });

    const mail = await waitForLink(email, since);
    expect(mail.subject).toBe('Twój link do logowania w Sedno');
    const back = await clickEmailLink(mail.link);
    expect(`${back.origin}${back.pathname}`).toBe(`${SITE_URL}/auth/potwierdz`);
    expect(back.searchParams.get('next')).toBe(next);

    const response = await confirm(new NextRequest(back));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(next);

    // Sesja w ciasteczkach httpOnly; weryfikatory PKCE usunięte (zużyte, bez wartości po zalogowaniu).
    expect(sessionCookies().length).toBeGreaterThan(0);
    for (const name of sessionCookies()) expect(browser.jar.get(name)?.options.httpOnly).toBe(true);
    expect(verifierCookies()).toEqual([]);
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    expect(data.user?.email).toBe(email);
    users.push(data.user!.id);
    expect(await sql('select 1 from public.profiles where id = $1', [data.user!.id])).toHaveLength(1);

    // Ten sam link drugi raz: Supabase Auth wraca z błędem, trasa → /logowanie?blad=link.
    const again = await clickEmailLink(mail.link);
    const retry = await confirm(new NextRequest(again));
    expect(retry.headers.get('location')).toBe('/logowanie?blad=link');

    const out = await logout(
      new NextRequest(`${SITE_URL}/auth/wyloguj`, {
        method: 'POST',
        headers: { 'sec-fetch-site': 'same-origin' },
      }),
    );
    expect(out.status).toBe(303);
    expect(out.headers.get('location')).toBe('/');
    expect(sessionCookies()).toEqual([]);
    const after = await (await createSupabaseServerClient()).auth.getUser();
    expect(after.data.user).toBeNull();
  });

  it('link otwarty w innej przeglądarce (bez weryfikatora) → /logowanie?blad=link, bez sesji', async () => {
    const email = `flow-${randomUUID()}@example.com`;
    const since = new Date();
    await requestMagicLink({ status: 'idle' }, form({ intent: 'send', email, next: '/app/klienci' }));
    const [user] = await sql<{ id: string }>('select id from auth.users where email = $1', [email]);
    users.push(user!.id);

    const back = await clickEmailLink((await waitForLink(email, since)).link);
    browser.jar = new Map(); // druga przeglądarka: bez ciasteczek pierwszej
    const response = await confirm(new NextRequest(back));
    expect(response.headers.get('location')).toBe('/logowanie?blad=link');
    expect(sessionCookies()).toEqual([]);
  });
});

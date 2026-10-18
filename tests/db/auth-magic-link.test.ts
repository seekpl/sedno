/**
 * Logowanie linkiem z e-maila na prawdziwym Supabase Auth lokalnego stosu, bez Next.js (PROMPT.md §10, §17):
 * klient PKCE z pamięcią w RAM (jak ciasteczka httpOnly jednej przeglądarki) → e-mail w Mailpit (szablon Sedno)
 * → /auth/v1/verify → przekierowanie na {SITE_URL}/auth/potwierdz?…code=… → wymiana kodu na sesję.
 * Profil powstaje dopiero po kliknięciu w link. Link jest jednorazowy, działa tylko z weryfikatorem tej samej
 * przeglądarki, a nowy link unieważnia poprzedni (tekst „Poprzedni już nie działa”).
 */
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';
import type { Database } from '@/lib/supabase/database.types';
import { ANON_KEY, MAILPIT_URL, SITE_URL, SUPABASE_URL } from '../../scripts/local-supabase/config';
import { createUser, deleteUser, sql } from './helpers';

type MailpitSummary = { ID: string; Created: string };
type MailpitMessage = { Subject: string; Text: string; HTML: string };

const CONFIRM = `${SITE_URL}/auth/potwierdz`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const users: string[] = [];

afterAll(async () => {
  for (const id of users) await deleteUser(id);
});

/** Klient jednej „przeglądarki”: PKCE, weryfikator kodu w pamięci tego obiektu. */
function browser(): SupabaseClient<Database> {
  const store = new Map<string, string>();
  return createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => void store.set(key, value),
        removeItem: (key) => void store.delete(key),
      },
    },
  });
}

/** Najnowsza wiadomość do `email` wysłana po `since`, z linkiem /auth/v1/verify. */
async function waitForMail(email: string, since: Date): Promise<MailpitMessage & { link: string }> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const { messages } = (await search.json()) as { messages: MailpitSummary[] };
    const fresh = messages.find((m) => new Date(m.Created).getTime() >= since.getTime() - 1000);
    if (fresh) {
      const message = (await (
        await fetch(`${MAILPIT_URL}/api/v1/message/${fresh.ID}`)
      ).json()) as MailpitMessage;
      const link = /https?:\/\/[^\s"'<>)]+\/auth\/v1\/verify\?[^\s"'<>)]+/.exec(message.HTML)?.[0];
      if (!link) throw new Error('Brak linku /auth/v1/verify w wiadomości');
      return { ...message, link: link.replaceAll('&amp;', '&') };
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Nie przyszedł e-mail z linkiem');
}

/** Prośba o link (jak requestMagicLink) i wiadomość z Mailpit. */
async function requestLink(client: SupabaseClient<Database>, email: string, next = '/app/klienci') {
  const since = new Date();
  const emailRedirectTo = `${CONFIRM}?next=${encodeURIComponent(next)}`;
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo, shouldCreateUser: true },
  });
  expect(error).toBeNull();
  return { mail: await waitForMail(email, since), emailRedirectTo };
}

/** Kliknięcie w link: odpowiedź /auth/v1/verify bez podążania za przekierowaniem. */
async function click(link: string): Promise<URL> {
  const response = await fetch(link, { redirect: 'manual' });
  expect([302, 303]).toContain(response.status);
  return new URL(response.headers.get('location') ?? '');
}

async function userByEmail(email: string) {
  const [row] = await sql<{ id: string; email_confirmed_at: Date | null }>(
    'select id, email_confirmed_at from auth.users where email = $1',
    [email],
  );
  return row;
}

describe('logowanie linkiem z e-maila (Supabase Auth, PKCE)', () => {
  it('nowy adres: szablon Sedno, powrót na /auth/potwierdz z kodem i next, sesja, profil po kliknięciu', async () => {
    const email = `login-${randomUUID()}@example.com`;
    const client = browser();
    const next = '/app/klienci/abc/2026-09';
    const { mail, emailRedirectTo } = await requestLink(client, email, next);

    // Przed kliknięciem: konto czeka na potwierdzenie, profilu i zdarzenia jeszcze nie ma.
    const pending = await userByEmail(email);
    expect(pending?.email_confirmed_at).toBeNull();
    users.push(pending!.id);
    expect(await sql('select 1 from public.profiles where id = $1', [pending!.id])).toHaveLength(0);

    // Treść z supabase/templates (pobierana przez Supabase Auth z bramki lokalnego stosu).
    expect(mail.HTML).toContain('<html lang="pl"');
    expect(mail.HTML).toContain('Zaloguj się do Sedno');
    expect(mail.HTML).toContain('przez godzinę');

    const link = new URL(mail.link);
    expect(`${link.origin}${link.pathname}`).toBe(`${SUPABASE_URL}/auth/v1/verify`);
    expect(link.searchParams.get('token')).toMatch(/^pkce_/);
    expect(link.searchParams.get('redirect_to')).toBe(emailRedirectTo);

    const back = await click(mail.link);
    expect(`${back.origin}${back.pathname}`).toBe(CONFIRM);
    expect(back.origin).toBe('http://localhost:3100');
    expect(back.searchParams.get('next')).toBe(next);
    const code = back.searchParams.get('code');
    expect(code).toMatch(UUID);

    // Kliknięcie potwierdza adres: trigger tworzy profil i zdarzenie signup_completed.
    expect((await userByEmail(email))?.email_confirmed_at).not.toBeNull();
    expect(await sql('select 1 from public.profiles where id = $1', [pending!.id])).toHaveLength(1);
    const events = await sql<{ name: string }>('select name from public.events where owner_id = $1', [
      pending!.id,
    ]);
    expect(events.map((e) => e.name)).toEqual(['signup_completed']);

    const { data, error } = await client.auth.exchangeCodeForSession(code!);
    expect(error).toBeNull();
    expect(data.session?.user.id).toBe(pending!.id);
    expect(data.session?.user.email).toBe(email);
  });

  it('link jest jednorazowy: drugie kliknięcie wraca z błędem i bez kodu', async () => {
    const email = `login-${randomUUID()}@example.com`;
    const { mail } = await requestLink(browser(), email);
    users.push((await userByEmail(email))!.id);
    expect((await click(mail.link)).searchParams.get('code')).toMatch(UUID);

    const again = await click(mail.link);
    expect(`${again.origin}${again.pathname}`).toBe(CONFIRM);
    expect(again.searchParams.get('code')).toBeNull();
    // Trasa /auth/potwierdz przekierowuje taki powrót na /logowanie?blad=link.
    expect(again.searchParams.get('error')).toBe('access_denied');
  });

  it('kod nie działa w innej przeglądarce (bez weryfikatora PKCE)', async () => {
    const email = `login-${randomUUID()}@example.com`;
    const { mail } = await requestLink(browser(), email);
    users.push((await userByEmail(email))!.id);
    const code = (await click(mail.link)).searchParams.get('code');

    const other = browser();
    const { data, error } = await other.auth.exchangeCodeForSession(code!);
    expect(error).not.toBeNull();
    expect(data.session).toBeNull();
  });

  it('znany adres: link logowania; nowy link unieważnia poprzedni', async () => {
    const known = await createUser('login-known');
    users.push(known.id);
    const client = browser();

    const first = await requestLink(client, known.email);
    // Lokalnie najwyżej jeden e-mail na adres na sekundę (w chmurze: na minutę).
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const second = await requestLink(client, known.email);
    expect(second.mail.link).not.toBe(first.mail.link);

    const stale = await click(first.mail.link);
    expect(stale.searchParams.get('code')).toBeNull();
    expect(stale.searchParams.get('error')).toBe('access_denied');

    const fresh = await click(second.mail.link);
    const { data, error } = await client.auth.exchangeCodeForSession(fresh.searchParams.get('code')!);
    expect(error).toBeNull();
    expect(data.session?.user.id).toBe(known.id);
    // Profil istniał wcześniej — jeden, bez drugiego zdarzenia rejestracji.
    expect(await sql('select 1 from public.profiles where id = $1', [known.id])).toHaveLength(1);
  });
});

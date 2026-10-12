import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileStore, getStore, StoreError, SupabaseStore } from '@/lib/server/store';

let dir: string;
const tempDirs: string[] = [];

function tempDir(): string {
  const created = fs.mkdtempSync(path.join(os.tmpdir(), 'sedno-store-'));
  tempDirs.push(created);
  return created;
}

beforeEach(() => {
  dir = path.join(tempDir(), 'nested', 'dir');
});

afterAll(() => {
  for (const created of tempDirs) fs.rmSync(created, { recursive: true, force: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function readJsonl(file: string): Record<string, unknown>[] {
  return fs
    .readFileSync(path.join(dir, file), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('FileStore (rozwój i testy)', () => {
  it('dopisuje zdarzenia jako JSON Lines z kolumnami jak w bazie i tworzy katalog', async () => {
    const store = new FileStore(dir);
    await store.insertEvent({
      name: 'csv_parsed',
      anonId: 'a'.repeat(22),
      ownerId: null,
      props: { rows: 31 },
    });
    await store.insertEvent({ name: 'link_opened', anonId: null, ownerId: null, props: {} });

    const rows = readJsonl('events.jsonl');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: 'csv_parsed',
      anon_id: 'a'.repeat(22),
      owner_id: null,
      props: { rows: 31 },
    });
    expect(typeof rows[0]?.created_at).toBe('string');
    expect(rows[1]).toMatchObject({ name: 'link_opened', anon_id: null, props: {} });
  });

  it('lista oczekujących: nowy wpis → created, ten sam e-mail i plan → exists bez drugiego wiersza', async () => {
    const store = new FileStore(dir);
    const consentAt = new Date('2026-10-12T10:00:00Z');
    expect(await store.insertWaitlist({ email: 'ala@firma.pl', plan: 'solo', consentAt })).toBe('created');
    expect(await store.insertWaitlist({ email: 'ala@firma.pl', plan: 'solo', consentAt })).toBe('exists');
    // Ten sam adres na inny plan to osobny wpis (unique (email, plan)).
    expect(await store.insertWaitlist({ email: 'ala@firma.pl', plan: 'studio', consentAt })).toBe('created');

    const rows = readJsonl('waitlist.jsonl');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      email: 'ala@firma.pl',
      plan: 'solo',
      consent_at: '2026-10-12T10:00:00.000Z',
    });
  });

  it('równoległe zapisy tego samego adresu dają jeden wiersz', async () => {
    const store = new FileStore(dir);
    const consentAt = new Date();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        store.insertWaitlist({ email: 'ola@firma.pl', plan: 'solo', consentAt }),
      ),
    );
    expect(results.filter((r) => r === 'created')).toHaveLength(1);
    expect(readJsonl('waitlist.jsonl')).toHaveLength(1);
  });

  it('pomija uszkodzone linie przy sprawdzaniu duplikatów', async () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'waitlist.jsonl'), 'to nie jest JSON\n\n');
    const store = new FileStore(dir);
    expect(await store.insertWaitlist({ email: 'ala@firma.pl', plan: 'solo', consentAt: new Date() })).toBe(
      'created',
    );
  });

  it('błąd zapisu nie zawiera danych wiersza', async () => {
    // Katalog docelowy jest plikiem — mkdir się nie uda.
    const file = path.join(tempDir(), 'plik');
    fs.writeFileSync(file, '');
    const store = new FileStore(file);
    const error = await store
      .insertWaitlist({ email: 'tajny@firma.pl', plan: 'solo', consentAt: new Date() })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StoreError);
    expect(String((error as Error).message)).not.toContain('tajny');
  });
});

describe('SupabaseStore', () => {
  function fakeClient(result: { error: { code?: string; details?: string } | null }) {
    const insert = vi.fn().mockResolvedValue(result);
    const from = vi.fn().mockReturnValue({ insert });
    return { client: { from } as unknown as SupabaseClient, from, insert };
  }

  it('wstawia zdarzenie z kolumnami snake_case', async () => {
    const { client, from, insert } = fakeClient({ error: null });
    await new SupabaseStore(client).insertEvent({
      name: 'waitlist_joined',
      anonId: null,
      ownerId: null,
      props: { plan: 'solo' },
    });
    expect(from).toHaveBeenCalledWith('events');
    expect(insert).toHaveBeenCalledWith({
      name: 'waitlist_joined',
      anon_id: null,
      owner_id: null,
      props: { plan: 'solo' },
    });
  });

  it('lista: brak błędu → created; 23505 → exists', async () => {
    const consentAt = new Date('2026-10-12T10:00:00Z');
    const ok = fakeClient({ error: null });
    expect(
      await new SupabaseStore(ok.client).insertWaitlist({ email: 'a@b.pl', plan: 'solo', consentAt }),
    ).toBe('created');
    expect(ok.insert).toHaveBeenCalledWith({
      email: 'a@b.pl',
      plan: 'solo',
      consent_at: '2026-10-12T10:00:00.000Z',
    });

    const dup = fakeClient({ error: { code: '23505', details: 'Key (email, plan)=(a@b.pl, solo)' } });
    expect(
      await new SupabaseStore(dup.client).insertWaitlist({ email: 'a@b.pl', plan: 'solo', consentAt }),
    ).toBe('exists');
  });

  it('inny błąd → StoreError bez szczegółów (e-mail z details nie wycieka)', async () => {
    const { client } = fakeClient({ error: { code: '42501', details: 'tajny@firma.pl' } });
    const error = await new SupabaseStore(client)
      .insertWaitlist({ email: 'tajny@firma.pl', plan: 'solo', consentAt: new Date() })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StoreError);
    expect((error as StoreError).code).toBe('42501');
    expect((error as Error).message).not.toContain('tajny');
  });

  it('błąd zdarzenia → StoreError; kod spoza wzorca jest pomijany', async () => {
    const { client } = fakeClient({ error: { code: 'kod z treścią @ i spacjami' } });
    const error = await new SupabaseStore(client)
      .insertEvent({ name: 'link_created', anonId: null, ownerId: null, props: {} })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StoreError);
    expect((error as StoreError).code).toBeUndefined();
    expect((error as Error).message).not.toContain('@');
  });
});

describe('getStore — wybór magazynu według zmiennych środowiskowych', () => {
  const supabase = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://projekt.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'klucz-serwisowy',
  };

  it('Supabase, gdy są oba: adres i klucz serwisowy (także obok katalogu deweloperskiego)', () => {
    expect(getStore({ ...supabase })).toBeInstanceOf(SupabaseStore);
    expect(getStore({ ...supabase, SEDNO_DEV_STORE_DIR: dir })).toBeInstanceOf(SupabaseStore);
  });

  it('sam adres Supabase (bez klucza) nie wystarcza', () => {
    expect(getStore({ NEXT_PUBLIC_SUPABASE_URL: supabase.NEXT_PUBLIC_SUPABASE_URL })).toBeNull();
    expect(getStore({ SUPABASE_SERVICE_ROLE_KEY: supabase.SUPABASE_SERVICE_ROLE_KEY })).toBeNull();
  });

  it('FileStore, gdy ustawiony jest tylko SEDNO_DEV_STORE_DIR (ścieżka bezwzględna)', () => {
    const store = getStore({ SEDNO_DEV_STORE_DIR: 'tmp-store' });
    expect(store).toBeInstanceOf(FileStore);
    expect((store as FileStore).dir).toBe(path.resolve('tmp-store'));
  });

  it('nic nie ustawione (albo same spacje) → null', () => {
    expect(getStore({})).toBeNull();
    expect(
      getStore({
        NEXT_PUBLIC_SUPABASE_URL: ' ',
        SUPABASE_SERVICE_ROLE_KEY: ' ',
        SEDNO_DEV_STORE_DIR: ' ',
      }),
    ).toBeNull();
  });

  it('domyślnie czyta process.env', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('SEDNO_DEV_STORE_DIR', dir);
    expect(getStore()).toBeInstanceOf(FileStore);
    vi.unstubAllEnvs();
  });
});

describe('migracja waitlist i events (PROMPT.md §8)', () => {
  const raw = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20261012000000_waitlist_events.sql'),
    'utf8',
  );
  // Bez komentarzy i z pojedynczymi spacjami — sprawdzamy instrukcje, nie opisy.
  const sql = raw.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase();

  it('tabele mają dokładnie kolumny z §8', () => {
    // Kolumny po przecinkach spoza nawiasów („unique (email, plan)” to jedna pozycja).
    const table = (name: string) =>
      new RegExp(`create table public\\.${name} \\((.*?)\\);`)
        .exec(sql)?.[1]
        ?.split(/,(?![^(]*\))/)
        .map((c) => c.trim());
    expect(table('waitlist')).toEqual([
      'id uuid primary key default gen_random_uuid()',
      'email text not null',
      "plan text not null default 'studio'",
      'consent_at timestamptz not null',
      'created_at timestamptz not null default now()',
      'unique (email, plan)',
    ]);
    expect(table('events')).toEqual([
      'id bigserial primary key',
      'name text not null',
      'anon_id text',
      'owner_id uuid',
      "props jsonb not null default '{}'",
      'created_at timestamptz not null default now()',
    ]);
  });

  it('RLS włączone na obu tabelach i żadnej polityki (zapis tylko kluczem serwisowym)', () => {
    expect(sql).toContain('alter table public.waitlist enable row level security;');
    expect(sql).toContain('alter table public.events enable row level security;');
    expect(sql).not.toMatch(/create policy|disable row level security|grant /);
  });

  it('role klienckie bez uprawnień; indeks pod tygodniowy lejek', () => {
    expect(sql).toContain('revoke all on table public.waitlist from anon, authenticated;');
    expect(sql).toContain('revoke all on table public.events from anon, authenticated;');
    expect(sql).toContain('revoke all on sequence public.events_id_seq from anon, authenticated;');
    expect(sql).toMatch(/create index \w+ on public\.events \(name, created_at\);/);
  });
});

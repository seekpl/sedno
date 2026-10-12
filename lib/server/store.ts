/**
 * Zapis zdarzeń i listy oczekujących (PROMPT.md §8, §16; docs/decisions.md, p. 18). Tylko serwer.
 *
 * - SupabaseStore: produkcja. Klucz serwisowy (omija RLS), sesja niezapisywana.
 * - FileStore: tylko rozwój i testy (SEDNO_DEV_STORE_DIR) — pliki JSON Lines z tymi samymi kolumnami co baza.
 *
 * Nigdy nie logujemy adresów e-mail ani właściwości zdarzeń. Błędy niosą tylko nazwę tabeli i kod błędu.
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EventName } from '@/lib/analytics/events';

// Pakiet „server-only” nie jest dostępny w projekcie, więc strażnik działa w czasie wykonania.
if (typeof window !== 'undefined') {
  throw new Error('lib/server/store.ts działa wyłącznie na serwerze.');
}

export type WaitlistPlan = 'solo' | 'studio';

/** Limit czasu zapytania do Supabase (zapis na listę, zdarzenie). */
export const SUPABASE_TIMEOUT_MS = 8000;

export type EventRow = {
  name: EventName;
  anonId: string | null;
  ownerId: string | null;
  /** Właściwości już sprawdzone ścisłym schematem z lib/analytics/events.ts. */
  props: Record<string, unknown>;
};

export type WaitlistRow = { email: string; plan: WaitlistPlan; consentAt: Date };

export interface Store {
  insertEvent(row: EventRow): Promise<void>;
  /** 'exists' — para (e-mail, plan) jest już na liście; nic nie zapisujemy drugi raz. */
  insertWaitlist(row: WaitlistRow): Promise<'created' | 'exists'>;
}

type Table = 'events' | 'waitlist';

/** Błąd zapisu bez treści wiersza: tylko tabela i kod (np. kod Postgresa), bezpieczny do logów. */
export class StoreError extends Error {
  readonly table: Table;
  readonly code: string | undefined;

  constructor(table: Table, code?: unknown) {
    const safeCode = typeof code === 'string' && /^[A-Z0-9_]{1,12}$/i.test(code) ? code : undefined;
    super(`Zapis do tabeli ${table} nie powiódł się${safeCode ? ` (kod ${safeCode})` : ''}.`);
    this.name = 'StoreError';
    this.table = table;
    this.code = safeCode;
  }
}

/** Kod Postgresa „unique_violation”: para (email, plan) już istnieje. */
const UNIQUE_VIOLATION = '23505';

export class SupabaseStore implements Store {
  constructor(private readonly client: SupabaseClient) {}

  async insertEvent(row: EventRow): Promise<void> {
    const { error } = await this.client.from('events').insert({
      name: row.name,
      anon_id: row.anonId,
      owner_id: row.ownerId,
      props: row.props,
    });
    if (error) throw new StoreError('events', error.code);
  }

  async insertWaitlist(row: WaitlistRow): Promise<'created' | 'exists'> {
    const { error } = await this.client.from('waitlist').insert({
      email: row.email,
      plan: row.plan,
      consent_at: row.consentAt.toISOString(),
    });
    if (!error) return 'created';
    // Szczegóły błędu (details) zawierają adres e-mail — nie przekazujemy ich dalej.
    if (error.code === UNIQUE_VIOLATION) return 'exists';
    throw new StoreError('waitlist', error.code);
  }
}

// Kolejka zapisów do plików: sprawdzenie duplikatu i dopisanie wiersza nie mogą się przeplatać.
let fileQueue: Promise<unknown> = Promise.resolve();

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = fileQueue.then(task, task);
  fileQueue = run.catch(() => undefined);
  return run;
}

/** Tylko rozwój i testy (np. e2e prywatności czyta events.jsonl). Nie ustawiaj SEDNO_DEV_STORE_DIR na produkcji. */
export class FileStore implements Store {
  constructor(readonly dir: string) {}

  insertEvent(row: EventRow): Promise<void> {
    return serialized(async () => {
      await this.append('events', {
        name: row.name,
        anon_id: row.anonId,
        owner_id: row.ownerId,
        props: row.props,
        created_at: new Date().toISOString(),
      });
    });
  }

  insertWaitlist(row: WaitlistRow): Promise<'created' | 'exists'> {
    return serialized(async () => {
      const existing = await this.read('waitlist');
      if (existing.some((r) => r.email === row.email && r.plan === row.plan)) return 'exists';
      await this.append('waitlist', {
        email: row.email,
        plan: row.plan,
        consent_at: row.consentAt.toISOString(),
        created_at: new Date().toISOString(),
      });
      return 'created';
    });
  }

  private file(table: Table): string {
    return path.join(this.dir, `${table}.jsonl`);
  }

  private async append(table: Table, record: Record<string, unknown>): Promise<void> {
    try {
      await mkdir(this.dir, { recursive: true });
      await appendFile(this.file(table), `${JSON.stringify(record)}\n`, 'utf8');
    } catch {
      throw new StoreError(table);
    }
  }

  private async read(table: Table): Promise<Record<string, unknown>[]> {
    let text: string;
    try {
      text = await readFile(this.file(table), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new StoreError(table);
    }
    return text.split('\n').flatMap((line) => {
      if (!line.trim()) return [];
      try {
        const value: unknown = JSON.parse(line);
        return value && typeof value === 'object' ? [value as Record<string, unknown>] : [];
      } catch {
        return [];
      }
    });
  }
}

let cachedSupabase: { url: string; key: string; store: SupabaseStore } | null = null;

function supabaseStore(url: string, key: string): SupabaseStore {
  if (cachedSupabase?.url !== url || cachedSupabase.key !== key) {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      // Zawieszony Supabase nie może trzymać formularza w stanie „zapisuję” do limitu platformy.
      global: {
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS) }),
      },
    });
    cachedSupabase = { url, key, store: new SupabaseStore(client) };
  }
  return cachedSupabase.store;
}

/** Zmienne środowiskowe (domyślnie process.env; w testach zwykły obiekt). */
export type StoreEnv = Readonly<Record<string, string | undefined>>;

/**
 * Supabase, gdy ustawione są NEXT_PUBLIC_SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY; inaczej FileStore,
 * gdy ustawione jest SEDNO_DEV_STORE_DIR; inaczej null (akcje zwracają wtedy uczciwy błąd).
 */
export function getStore(env: StoreEnv = process.env): Store | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && key) return supabaseStore(url, key);
  const dir = env.SEDNO_DEV_STORE_DIR?.trim();
  if (dir) return new FileStore(path.resolve(dir));
  return null;
}

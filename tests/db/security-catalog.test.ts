/**
 * Niezmienniki bezpieczeństwa schematu (Faza 2) sprawdzane w katalogu Postgresa po każdej migracji, żeby
 * przyszła migracja nie poszerzyła dostępu po cichu. Lokalny stos odtwarza domyślne granty Supabase (role
 * API dostają wszystko w public), więc nowa tabela bez RLS albo nowa funkcja bez odebranych uprawnień
 * wychodzi tu od razu.
 */
import { describe, expect, it } from 'vitest';
import { sql } from './helpers';

/** Funkcje, które wolno wołać przez PostgREST (RPC). Wszystko inne w public: tylko serwer i triggery. */
const RPC_ALLOWLIST = { anon: ['get_shared_report'], authenticated: ['get_shared_report'] } as const;

/** Uprawnienia roli authenticated do kolumn (poza SELECT do wszystkich kolumn czterech tabel kont). */
const AUTHENTICATED_WRITES: Record<string, { INSERT: string[]; UPDATE: string[] }> = {
  profiles: { INSERT: [], UPDATE: ['brand_name', 'display_name'] },
  clients: { INSERT: ['industry', 'name'], UPDATE: ['archived_at', 'industry', 'name'] },
  reports: {
    INSERT: ['client_id', 'data', 'period', 'sent_at', 'status'],
    UPDATE: ['data', 'sent_at', 'status'],
  },
  share_links: { INSERT: ['report_id', 'token'], UPDATE: ['revoked_at'] },
};

const ACCOUNT_TABLES = Object.keys(AUTHENTICATED_WRITES);

describe('tabele', () => {
  it('RLS włączone na każdej tabeli w public; brak widoków i tabel obcych', async () => {
    const rows = await sql<{ relname: string; relkind: string; relrowsecurity: boolean }>(
      `select c.relname, c.relkind, c.relrowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')`,
    );
    expect(rows.filter((r) => r.relkind !== 'r' && r.relkind !== 'p')).toEqual([]);
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });

  it('anon nie ma żadnych uprawnień do tabel ani sekwencji w public', async () => {
    const rows = await sql<{ name: string }>(
      `select c.relname as name
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
          and (has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger')
               or has_any_column_privilege('anon', c.oid, 'select, insert, update, references'))`,
    );
    expect(rows).toEqual([]);
    const sequences = await sql<{ name: string }>(
      `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'usage, select, update') end`,
    );
    expect(sequences).toEqual([]);
  });

  it('authenticated: dokładnie oczekiwane uprawnienia (SELECT, INSERT i UPDATE wybranych kolumn)', async () => {
    const tableGrants = await sql<{ table_name: string; privilege_type: string }>(
      `select table_name, privilege_type from information_schema.role_table_grants
        where grantee = 'authenticated' and table_schema = 'public' order by 1, 2`,
    );
    expect(tableGrants).toEqual(
      [...ACCOUNT_TABLES].sort().map((table_name) => ({ table_name, privilege_type: 'SELECT' })),
    );

    const columnGrants = await sql<{ table_name: string; column_name: string; privilege_type: string }>(
      `select table_name, column_name, privilege_type from information_schema.column_privileges
        where grantee = 'authenticated' and table_schema = 'public' and privilege_type <> 'SELECT'`,
    );
    const actual: Record<string, { INSERT: string[]; UPDATE: string[] }> = {};
    for (const { table_name, column_name, privilege_type } of columnGrants) {
      const entry = (actual[table_name] ??= { INSERT: [], UPDATE: [] });
      if (privilege_type !== 'INSERT' && privilege_type !== 'UPDATE') {
        throw new Error(`Nieoczekiwane uprawnienie ${privilege_type} do ${table_name}.${column_name}`);
      }
      entry[privilege_type].push(column_name);
      entry[privilege_type].sort();
    }
    for (const table of ACCOUNT_TABLES) actual[table] ??= { INSERT: [], UPDATE: [] };
    expect(actual).toEqual(AUTHENTICATED_WRITES);

    const sequences = await sql<{ name: string }>(
      `select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and case when c.relkind = 'S' then has_sequence_privilege('authenticated', c.oid, 'usage, select, update') end`,
    );
    expect(sequences).toEqual([]);
  });

  it('role API nie tworzą obiektów w public', async () => {
    const [row] = await sql<{ anon: boolean; authenticated: boolean }>(
      `select has_schema_privilege('anon', 'public', 'create') as anon,
              has_schema_privilege('authenticated', 'public', 'create') as authenticated`,
    );
    expect(row).toEqual({ anon: false, authenticated: false });
  });
});

describe('polityki RLS', () => {
  it('tylko dla authenticated, oparte wyłącznie na auth.uid(); zdarzenia i lista oczekujących bez polityk', async () => {
    const rows = await sql<{ table: string; roles: string[]; qual: string | null; check: string | null }>(
      `select tablename as table, roles::text[] as roles, qual, with_check as check
         from pg_policies where schemaname = 'public'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const policy of rows) {
      expect(ACCOUNT_TABLES, policy.table).toContain(policy.table);
      expect(policy.roles).toEqual(['authenticated']);
      for (const expression of [policy.qual, policy.check]) {
        if (expression === null) continue;
        expect(expression).toContain('auth.uid()');
        expect(expression).not.toMatch(/jwt|user_metadata|app_metadata|current_setting|true\b/i);
      }
    }
  });

  it('brak polityk DELETE i polityk „dla wszystkich”', async () => {
    const rows = await sql<{ cmd: string }>(`select cmd from pg_policies where schemaname = 'public'`);
    expect(rows.map((r) => r.cmd).filter((cmd) => cmd === 'DELETE' || cmd === 'ALL')).toEqual([]);
  });
});

describe('funkcje', () => {
  type Fn = { name: string; secdef: boolean; config: string[] | null; anon: boolean; authenticated: boolean };
  const functions = () =>
    sql<Fn>(
      `select p.proname as name, p.prosecdef as secdef, p.proconfig as config,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'`,
    );

  it('role API wywołają tylko funkcje z listy dozwolonych', async () => {
    const rows = await functions();
    expect(rows.filter((f) => f.anon).map((f) => f.name)).toEqual([...RPC_ALLOWLIST.anon]);
    expect(rows.filter((f) => f.authenticated).map((f) => f.name)).toEqual([...RPC_ALLOWLIST.authenticated]);
  });

  it('każda funkcja ma pusty search_path (security definer bez przejęcia przez obiekty użytkownika)', async () => {
    const rows = await functions();
    expect(rows.some((f) => f.secdef)).toBe(true);
    for (const fn of rows) expect(fn.config, fn.name).toContain('search_path=""');
  });

  it('funkcje security definer należą do roli bez logowania przez API', async () => {
    const rows = await sql<{ name: string; owner: string }>(
      `select p.proname as name, pg_get_userbyid(p.proowner) as owner
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef`,
    );
    for (const fn of rows)
      expect(['anon', 'authenticated', 'authenticator', 'service_role']).not.toContain(fn.owner);
  });
});

describe('ograniczenia z utwardzenia', () => {
  it('unikalność raportu w zakresie właściciela i triggery ochronne są na miejscu', async () => {
    const constraints = await sql<{ conname: string }>(
      `select conname from pg_constraint where conrelid = 'public.reports'::regclass and contype = 'u'`,
    );
    expect(constraints.map((c) => c.conname).sort()).toEqual([
      'reports_id_owner_id_key',
      'reports_owner_client_period_key',
    ]);
    const triggers = await sql<{ tgname: string }>(
      `select tgname from pg_trigger where not tgisinternal and tgrelid in
         ('public.clients'::regclass, 'public.reports'::regclass, 'public.share_links'::regclass)`,
    );
    expect(triggers.map((t) => t.tgname).sort()).toEqual([
      'clients_enforce_quota',
      'clients_included_in_free',
      'reports_enforce_quota',
      'reports_touch_updated_at',
      'share_links_enforce_quota',
      'share_links_revoke_is_final',
    ]);
  });
});

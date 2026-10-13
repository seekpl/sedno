/**
 * lib/supabase/database.types.ts pisany ręcznie musi zgadzać się z migracjami: każda kolumna z typów istnieje
 * w bazie i odwrotnie (TypeScript pilnuje, że lista poniżej obejmuje wszystkie klucze Row).
 */
import { describe, expect, it } from 'vitest';
import type { Database } from '@/lib/supabase/database.types';
import { sql } from './helpers';

type TableName = keyof Database['public']['Tables'];
type Columns = { [T in TableName]: { [K in keyof Database['public']['Tables'][T]['Row']]: true } };

const COLUMNS: Columns = {
  profiles: {
    id: true,
    display_name: true,
    brand_name: true,
    logo_path: true,
    plan: true,
    plan_renews_at: true,
    stripe_customer_id: true,
    created_at: true,
  },
  clients: {
    id: true,
    owner_id: true,
    name: true,
    industry: true,
    included_in_free: true,
    archived_at: true,
    created_at: true,
  },
  reports: {
    id: true,
    owner_id: true,
    client_id: true,
    period: true,
    status: true,
    data: true,
    unlocked: true,
    sent_at: true,
    created_at: true,
    updated_at: true,
  },
  share_links: {
    token: true,
    report_id: true,
    owner_id: true,
    created_at: true,
    expires_at: true,
    revoked_at: true,
    views: true,
  },
  waitlist: { id: true, email: true, plan: true, consent_at: true, created_at: true },
  events: { id: true, name: true, anon_id: true, owner_id: true, props: true, created_at: true },
};

describe('typy bazy zgodne z migracjami', () => {
  it('kolumny każdej tabeli', async () => {
    const rows = await sql<{ table_name: string; column_name: string }>(
      "select table_name, column_name from information_schema.columns where table_schema = 'public'",
    );
    const actual: Record<string, string[]> = {};
    for (const row of rows) (actual[row.table_name] ??= []).push(row.column_name);
    for (const [table, columns] of Object.entries(COLUMNS)) {
      expect(actual[table]?.sort(), table).toEqual(Object.keys(columns).sort());
    }
    expect(Object.keys(actual).sort()).toEqual(Object.keys(COLUMNS).sort());
  });

  it('wartości typów wyliczeniowych', async () => {
    const rows = await sql<{ typname: string; labels: string[] }>(
      `select t.typname, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
         from pg_type t join pg_enum e on e.enumtypid = t.oid
         join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'public' group by t.typname`,
    );
    const enums: { [K in keyof Database['public']['Enums']]: Database['public']['Enums'][K][] } = {
      plan_t: ['free', 'solo'],
      industry_t: ['salon', 'restauracja', 'gabinet', 'sklep', 'inne'],
      report_status_t: ['draft', 'ready', 'sent'],
    };
    expect(Object.fromEntries(rows.map((r) => [r.typname, r.labels]))).toEqual(enums);
  });
});

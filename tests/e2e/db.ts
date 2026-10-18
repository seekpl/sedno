/**
 * Odczyt bazy lokalnego stosu Supabase w testach e2e (scripts/local-supabase): to, co serwer aplikacji
 * zapisał — zdarzenia, lista oczekujących, konta, raporty, linki — sprawdzamy u źródła.
 */
import pg from 'pg';
import { DB_URL } from '../../scripts/local-supabase/config';

export async function query<T extends pg.QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

/** Nazwy zdarzeń zapisanych od chwili `since`. */
export async function eventNamesSince(since: Date): Promise<string[]> {
  const rows = await query<{ name: string }>('select name from public.events where created_at >= $1', [
    since,
  ]);
  return rows.map((r) => r.name);
}

/** Cała zawartość wszystkich tabel public jako tekst JSON (do szukania fragmentów pliku). */
export async function dumpPublicTables(): Promise<string> {
  const tables = await query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public'",
  );
  let out = '';
  for (const { tablename } of tables) {
    const [row] = await query<{ dump: string }>(
      `select coalesce(json_agg(t), '[]'::json)::text as dump from public.${pg.escapeIdentifier(tablename)} t`,
    );
    out += `${tablename}: ${row?.dump ?? ''}\n`;
  }
  return out;
}

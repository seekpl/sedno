import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateShareToken, isShareTokenFormat } from '@/lib/links/token';
import type { Database } from '@/lib/supabase/database.types';
import { z } from '@/lib/zod';

/**
 * Linki do raportu (PROMPT.md §8, §11): token z CSPRNG (lib/links/token.ts), ważność 12 miesięcy (domyślna
 * wartość kolumny), jeden aktywny link na raport — nowy link wyłącza poprzedni. Wszystko przez RLS jako
 * zalogowany użytkownik: link powstaje tylko do własnego raportu (polityka i klucz obcy z właścicielem),
 * cudzy token po prostu nic nie znajduje. Tokenów nie logujemy.
 */
type Db = SupabaseClient<Database>;

/** Aktywny link w edytorze: token, daty i licznik otwarć (bez identyfikatorów raportu i właściciela). */
export type ShareLinkInfo = { token: string; createdAt: string; expiresAt: string; views: number };

export class LinksDataError extends Error {
  constructor(readonly step: 'read' | 'revoke' | 'create') {
    super(`Linki: operacja „${step}” nie powiodła się.`);
    this.name = 'LinksDataError';
  }
}

/** Raport nie istnieje albo należy do innego konta (RLS). */
export class LinkReportNotFoundError extends Error {
  constructor() {
    super('Linki: nie ma takiego raportu.');
    this.name = 'LinkReportNotFoundError';
  }
}

const LINK_COLUMNS = 'token, created_at, expires_at, views';
const uuid = z.uuid();

type LinkRow = { token: string; created_at: string; expires_at: string; views: number };

const toInfo = (row: LinkRow): ShareLinkInfo => ({
  token: row.token,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  views: row.views,
});

/** Najnowszy aktywny link raportu (nieodwołany, nieprzeterminowany) albo null. */
export async function getActiveLink(
  db: Db,
  reportId: string,
  now: Date = new Date(),
): Promise<ShareLinkInfo | null> {
  if (!uuid.safeParse(reportId).success) return null;
  const { data, error } = await db
    .from('share_links')
    .select(LINK_COLUMNS)
    .eq('report_id', reportId)
    .is('revoked_at', null)
    .gt('expires_at', now.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new LinksDataError('read');
  return data ? toInfo(data) : null;
}

/** Ile razy próbujemy nowy token, gdyby (praktycznie niemożliwe przy 131 bitach) już istniał. */
const TOKEN_ATTEMPTS = 3;

/**
 * Nowy link do zapisanego raportu. Wcześniejsze aktywne linki tego raportu są wyłączane, więc klient ma
 * zawsze jeden działający adres. Rzuca LinkReportNotFoundError dla cudzego lub nieistniejącego raportu.
 */
export async function createLink(
  db: Db,
  reportId: string,
  options: { now?: Date; token?: () => string } = {},
): Promise<ShareLinkInfo> {
  const now = options.now ?? new Date();
  const nextToken = options.token ?? generateShareToken;
  if (!uuid.safeParse(reportId).success) throw new LinkReportNotFoundError();

  const report = await db.from('reports').select('id').eq('id', reportId).maybeSingle();
  if (report.error) throw new LinksDataError('read');
  if (!report.data) throw new LinkReportNotFoundError();

  const revoked = await db
    .from('share_links')
    .update({ revoked_at: now.toISOString() })
    .eq('report_id', reportId)
    .is('revoked_at', null);
  if (revoked.error) throw new LinksDataError('revoke');

  for (let attempt = 0; attempt < TOKEN_ATTEMPTS; attempt++) {
    const token = nextToken();
    if (!isShareTokenFormat(token)) throw new LinksDataError('create');
    const { data, error } = await db
      .from('share_links')
      .insert({ token, report_id: reportId })
      .select(LINK_COLUMNS)
      .single();
    if (!error && data) return toInfo(data);
    if (error?.code !== '23505') throw new LinksDataError('create');
  }
  throw new LinksDataError('create');
}

/**
 * „Wyłącz link”: link przestaje działać od razu (strona /r/{token} pokazuje share.expired). Już wyłączony
 * link to też sukces. 'not-found' dla nieistniejącego albo cudzego tokenu.
 */
export async function revokeLink(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<'revoked' | 'not-found'> {
  if (!isShareTokenFormat(token)) return 'not-found';
  const { data, error } = await db
    .from('share_links')
    .update({ revoked_at: now.toISOString() })
    .eq('token', token)
    .is('revoked_at', null)
    .select('token');
  if (error) throw new LinksDataError('revoke');
  if (data.length > 0) return 'revoked';
  const existing = await db.from('share_links').select('token').eq('token', token).maybeSingle();
  if (existing.error) throw new LinksDataError('read');
  return existing.data ? 'revoked' : 'not-found';
}

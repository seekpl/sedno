import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { cache } from 'react';
import { features } from '@/config/features';
import { readLogo } from '@/lib/logo/store';
import { reportDataSchema, type Branding, type ReportData } from '@/lib/report/types';
import { clientRateLimitKey } from '@/lib/server/client-ip';
import { rateLimit } from '@/lib/server/rate-limit';
import type { Database } from '@/lib/supabase/database.types';
import { requireSupabasePublicEnv } from '@/lib/supabase/env';
import { z } from '@/lib/zod';

/**
 * Raport publiczny /r/[token] (PROMPT.md §8, §11; docs/decisions.md, p. 96).
 *
 * - Token: dokładnie 22 znaki base62 — inny napis odrzucamy przed zapytaniem do bazy.
 * - Odczyt wyłącznie przez funkcję get_shared_report (security definer) kluczem anon bez sesji: zwraca
 *   { data, branding, hasLogo } tylko dla linku nieodwołanego i nieprzeterminowanego, bez identyfikatorów,
 *   i zwiększa licznik wyświetleń. Dane sprawdza jeszcze raz ścisły schemat raportu (obrona w głąb).
 * - Limit: 60 otwarć na minutę z jednego adresu IP (IPv6: sieć /64), logo 120 na minutę.
 * - Podgląd linku w komunikatorze (WhatsApp, Messenger, Slack, Teams…) pobiera stronę robotem: robot dostaje
 *   ogólną stronę bez zapytania do bazy — bez treści raportu u zewnętrznych serwisów i bez wyświetlenia
 *   („Link otwarto N razy” w edytorze liczy otwarcia ludzi, nie wklejenie linku do rozmowy).
 * - getSharedReport jest opakowane w React cache(): generateMetadata i strona dzielą jedno wywołanie,
 *   więc jedno wczytanie strony to jedno wyświetlenie.
 * - Logo: klucz serwisowy, ale tylko przez aktywny link (właściciel linku → profiles.logo_path). Adres logo
 *   zapisany w danych raportu (author.logoUrl) pomijamy.
 */

export const SHARE_TOKEN_PATTERN = /^[0-9A-Za-z]{22}$/;

export const SHARE_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const;
export const SHARE_LOGO_RATE_LIMIT = { limit: 120, windowMs: 60_000 } as const;

/** Limit czasu zapytań do Supabase (jak w lib/supabase/admin.ts). */
const TIMEOUT_MS = 8000;

export type SharedReport = { data: ReportData; branding: Branding; hasLogo: boolean };

export type SharedReportResult =
  | ({ status: 'ok' } & SharedReport)
  /** Link nieprawidłowy, wygasły albo odwołany — strona pokazuje share.expired. */
  | { status: 'not-found' }
  /** Za dużo otwarć z jednego połączenia. */
  | { status: 'rate-limited' }
  /** Robot podglądu linku: ogólna strona, bez bazy, bez wyświetlenia i bez treści raportu. */
  | { status: 'preview' };

export type SharedLogo = { bytes: Uint8Array; contentType: string };

/**
 * Roboty podglądu linków i wyszukiwarek (po nagłówku User-Agent). Tylko nazwy robotów — przeglądarki
 * wbudowane w aplikacje (Facebook „FBAN”, Instagram, LinkedInApp, Telegram) mają inne User-Agent i widzą
 * raport. Robot WhatsApp (i Signal, który się pod niego podszywa) zaczyna się od „WhatsApp/”.
 */
const PREVIEW_BOT =
  /^(?:WhatsApp|Mastodon)\/|facebookexternalhit|facebot|meta-external(?:agent|fetcher)|telegrambot|slackbot|slack-imgproxy|twitterbot|discordbot|linkedinbot|skypeuripreview|microsoftpreview|pinterestbot|redditbot|embedly|iframely|googlebot|bingbot|applebot|duckduckbot|yandexbot|baiduspider|bluesky cardyb/i;

export function isLinkPreviewBot(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent && PREVIEW_BOT.test(userAgent));
}

export function isShareToken(value: unknown): value is string {
  return typeof value === 'string' && SHARE_TOKEN_PATTERN.test(value);
}

const sharedSchema = z.object({
  data: reportDataSchema,
  branding: z.enum(['sedno-footer', 'author']),
  hasLogo: z.boolean(),
});

/** Klient z kluczem anon bez sesji (bez ciasteczek): get_shared_report działa jako rola anon. */
export function createAnonServerClient(): SupabaseClient<Database> {
  const { url, anonKey } = requireSupabasePublicEnv();
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }) },
  });
}

/**
 * Raport spod tokenu albo null (link nieprawidłowy, wygasły, odwołany albo dane niezgodne ze schematem).
 * Każde udane wywołanie liczy jedno wyświetlenie. Błąd bazy rzuca wyjątek (strona błędu, nie „wygasł”).
 */
export async function readSharedReport(
  db: SupabaseClient<Database>,
  token: string,
): Promise<SharedReport | null> {
  if (!isShareToken(token)) return null;
  const { data, error } = await db.rpc('get_shared_report', { p_token: token });
  if (error) throw new Error('Odczyt raportu z linku nie powiódł się.');
  if (data === null) return null;
  const parsed = sharedSchema.safeParse(data);
  if (!parsed.success) {
    // Bez treści raportu w logu — tylko fakt, że zapisane dane nie pasują do schematu.
    console.error('[sedno] Raport z linku nie pasuje do schematu ReportData.');
    return null;
  }
  // Logo na raporcie publicznym pokazuje wyłącznie trasa /r/{token}/logo (hasLogo). Adres https zapisany
  // w danych pomijamy: strona nie pobiera obrazków z obcych hostów (CSP), a taki adres mógłby śledzić czytelnika.
  const author = { name: parsed.data.data.author.name };
  return { ...parsed.data, data: { ...parsed.data.data, author } };
}

/**
 * Ścieżka logo właściciela aktywnego linku (nieodwołany, nieprzeterminowany) albo null. `db` to klient
 * z kluczem serwisowym: share_links i profiles nie są dostępne dla roli anon. Nie zwiększa licznika.
 */
export async function findSharedLogoPath(
  db: SupabaseClient<Database>,
  token: string,
  now: Date = new Date(),
): Promise<string | null> {
  if (!isShareToken(token)) return null;
  const link = await db
    .from('share_links')
    .select('owner_id')
    .eq('token', token)
    .is('revoked_at', null)
    .gt('expires_at', now.toISOString())
    .maybeSingle();
  if (link.error) throw new Error('Odczyt linku nie powiódł się.');
  if (!link.data) return null;
  const profile = await db.from('profiles').select('logo_path').eq('id', link.data.owner_id).maybeSingle();
  if (profile.error) throw new Error('Odczyt profilu nie powiódł się.');
  return profile.data?.logo_path ?? null;
}

/** Logo do raportu publicznego: bajty i typ z sygnatury pliku, albo null (brak logo lub nieaktywny link). */
export async function readSharedLogo(
  db: SupabaseClient<Database>,
  token: string,
): Promise<SharedLogo | null> {
  const path = await findSharedLogoPath(db, token);
  return path ? readLogo(path) : null;
}

/** User-Agent bieżącego żądania (poza żądaniem — null). */
async function requestUserAgent(): Promise<string | null> {
  try {
    return (await headers()).get('user-agent');
  } catch {
    return null;
  }
}

/** Wynik dla strony /r/[token] (bez kontekstu React: każde wywołanie to osobne wyświetlenie). */
export async function loadSharedReport(token: string): Promise<SharedReportResult> {
  if (!features.accounts || !isShareToken(token)) return { status: 'not-found' };
  if (isLinkPreviewBot(await requestUserAgent())) return { status: 'preview' };
  const ip = await clientRateLimitKey();
  if (!rateLimit(`share:ip:${ip}`, SHARE_RATE_LIMIT.limit, SHARE_RATE_LIMIT.windowMs)) {
    return { status: 'rate-limited' };
  }
  const report = await readSharedReport(createAnonServerClient(), token);
  return report ? { status: 'ok', ...report } : { status: 'not-found' };
}

/** Jedno wywołanie na żądanie: generateMetadata i strona dostają ten sam wynik (jedno wyświetlenie). */
export const getSharedReport = cache(loadSharedReport);

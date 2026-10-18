import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { siteUrl } from '@/components/site/seo';
import { readLogo, removeLogo } from '@/lib/logo/store';
import { warsawParts } from '@/lib/i18n/pl';
import type { Database, Enums, Json } from '@/lib/supabase/database.types';

/**
 * Konto jako całość (PROMPT.md §8 „Usunięcie konta”, „Eksport danych”; §15 RODO).
 * - Eksport: wszystkie dane właściciela przez sesję użytkownika (RLS — cudzych wierszy nie ma w wyniku).
 * - Usunięcie: klucz serwisowy (usunięcie użytkownika Supabase Auth kaskadowo usuwa profil, klientów,
 *   raporty i linki; zdarzenia zostają bez właściciela) — wywołujący sprawdza sesję.
 */
type Db = SupabaseClient<Database>;

/** Ile wierszy pobieramy jednym zapytaniem (PostgREST w Supabase ma domyślny limit 1000). */
const PAGE = 1000;

export type AccountExport = {
  exportedAt: string;
  profile: {
    email: string | null;
    display_name: string | null;
    brand_name: string | null;
    plan: Enums<'plan_t'>;
    has_logo: boolean;
    created_at: string | null;
  };
  clients: {
    name: string;
    industry: Enums<'industry_t'>;
    created_at: string;
    archived_at: string | null;
  }[];
  reports: {
    client: string | null;
    /** 'YYYY-MM' */
    period: string;
    status: Enums<'report_status_t'>;
    sent_at: string | null;
    created_at: string;
    updated_at: string;
    /** ReportData — liczby z podsumowania, efekty i komentarz (bez wierszy pliku i opisów). */
    data: Json;
  }[];
  links: {
    client: string | null;
    period: string | null;
    url: string;
    created_at: string;
    expires_at: string;
    revoked_at: string | null;
    views: number;
  }[];
};

/** Błąd eksportu lub usunięcia bez treści błędu bazy (ta nie trafia do interfejsu ani logów). */
export class AccountDataError extends Error {
  constructor(readonly step: 'profile' | 'clients' | 'reports' | 'links' | 'logo' | 'delete') {
    super(`Konto: operacja „${step}” nie powiodła się.`);
    this.name = 'AccountDataError';
  }
}

type Page<T> = { data: T[] | null; error: unknown };

/** Wszystkie wiersze zapytania, porcjami po PAGE (stała kolejność zapewnia `query`). */
async function fetchAll<T>(
  step: AccountDataError['step'],
  query: (from: number, to: number) => PromiseLike<Page<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error || !data) throw new AccountDataError(step);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

/** 'YYYY-MM-01' → 'YYYY-MM'. */
const monthOf = (period: string) => period.slice(0, 7);

/**
 * Wszystkie dane konta jako JSON (Ustawienia → „Pobierz dane (JSON)”). Bez identyfikatorów z bazy —
 * raporty i linki wskazują klienta nazwą i miesiącem. Bez pliku logo (w profilu tylko informacja, że jest).
 */
export async function exportAccount(
  db: Db,
  user: { email?: string | null },
  now: Date = new Date(),
): Promise<AccountExport> {
  const profile = await db
    .from('profiles')
    .select('display_name, brand_name, plan, logo_path, created_at')
    .maybeSingle();
  if (profile.error) throw new AccountDataError('profile');

  const [clients, reports, links] = await Promise.all([
    fetchAll('clients', (from, to) =>
      db
        .from('clients')
        .select('id, name, industry, created_at, archived_at')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAll('reports', (from, to) =>
      db
        .from('reports')
        .select('id, client_id, period, status, sent_at, created_at, updated_at, data')
        .order('period', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAll('links', (from, to) =>
      db
        .from('share_links')
        .select('token, report_id, created_at, expires_at, revoked_at, views')
        .order('created_at', { ascending: true })
        .order('token', { ascending: true })
        .range(from, to),
    ),
  ]);

  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const reportOf = new Map(
    reports.map((r) => [r.id, { client: clientName.get(r.client_id) ?? null, period: monthOf(r.period) }]),
  );
  const site = siteUrl();

  return {
    exportedAt: now.toISOString(),
    profile: {
      email: user.email ?? null,
      display_name: profile.data?.display_name ?? null,
      brand_name: profile.data?.brand_name ?? null,
      plan: profile.data?.plan ?? 'free',
      has_logo: profile.data?.logo_path != null,
      created_at: profile.data?.created_at ?? null,
    },
    clients: clients.map((c) => ({
      name: c.name,
      industry: c.industry,
      created_at: c.created_at,
      archived_at: c.archived_at,
    })),
    reports: reports.map((r) => ({
      client: clientName.get(r.client_id) ?? null,
      period: monthOf(r.period),
      status: r.status,
      sent_at: r.sent_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
      data: r.data,
    })),
    links: links.map((l) => ({
      client: reportOf.get(l.report_id)?.client ?? null,
      period: reportOf.get(l.report_id)?.period ?? null,
      url: `${site}/r/${l.token}`,
      created_at: l.created_at,
      expires_at: l.expires_at,
      revoked_at: l.revoked_at,
      views: l.views,
    })),
  };
}

/** Nazwa pliku eksportu z datą w czasie warszawskim: „sedno-dane-2026-10-13.json”. */
export function exportFileName(now: Date = new Date()): string {
  const { year, month, day } = warsawParts(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `sedno-dane-${year}-${pad(month)}-${pad(day)}.json`;
}

/**
 * Usuwa konto: najpierw plik logo (sprawdzamy, że go nie ma — inaczej przerywamy, żeby nie zostawić pliku
 * bez właściciela), potem użytkownika Supabase Auth. Kaskada w bazie usuwa profil, klientów, raporty
 * i linki; zdarzenia zostają anonimowe (events.owner_id → null). `admin` to klient z kluczem serwisowym,
 * `userId` — zalogowany użytkownik sprawdzony przez wywołującego.
 */
export async function deleteAccount(admin: Db, userId: string): Promise<void> {
  const profile = await admin.from('profiles').select('logo_path').eq('id', userId).maybeSingle();
  if (profile.error) throw new AccountDataError('profile');
  const logoPath = profile.data?.logo_path ?? null;

  await removeLogo(userId);
  if (logoPath && (await readLogo(logoPath))) throw new AccountDataError('logo');

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new AccountDataError('delete');
}

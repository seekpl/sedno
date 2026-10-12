-- Lista oczekujących i zdarzenia testu popytu (PROMPT.md §8, §16; docs/decisions.md, p. 18).
-- Faza 1: Supabase bez auth. Zapis wyłącznie przez Server Actions z kluczem serwisowym (service_role
-- omija RLS), z limitem zapytań po stronie aplikacji. Klucz anon nie może tu ani czytać, ani pisać.

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  plan text not null default 'studio',
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (email, plan)
);

create table public.events (
  id bigserial primary key,
  name text not null,
  anon_id text,
  -- Klucz obcy do profiles dojdzie w Fazie 2 (razem z kontami). W Fazie 1 zawsze null.
  owner_id uuid,
  -- Tylko właściwości ze ścisłych schematów (lib/analytics/events.ts): liczby i krótkie wyliczenia.
  props jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Tygodniowy lejek w /app/admin/metryki liczy zdarzenia według nazwy i czasu.
create index events_name_created_at_idx on public.events (name, created_at);

-- RLS włączone, celowo bez żadnych polityk: role anon i authenticated nie mają dostępu.
-- Odczyt dla administratora (ADMIN_EMAILS) dojdzie w Fazie 2 razem z auth — wtedy dodaj politykę
-- select opartą na auth.jwt() ->> 'email' albo czytaj przez service_role po sprawdzeniu w Server Action.
alter table public.waitlist enable row level security;
alter table public.events enable row level security;

-- Druga warstwa: bez domyślnych uprawnień Supabase dla ról klienckich (RLS i tak blokuje dostęp).
revoke all on table public.waitlist from anon, authenticated;
revoke all on table public.events from anon, authenticated;
revoke all on sequence public.events_id_seq from anon, authenticated;

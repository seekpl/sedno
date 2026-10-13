-- Konta, klienci, raporty i linki do raportów (PROMPT.md §8, Faza 2; docs/decisions.md, p. 92–).
--
-- Zasady:
-- - RLS na każdej tabeli; właściciel widzi i zmienia tylko swoje wiersze (auth.uid()).
-- - Granty kolumnowe: użytkownik nie może sam zmienić planu, klienta „w planie darmowym” ani odblokowania
--   raportu (to zmienia serwer kluczem serwisowym w Fazie 3). Domyślne granty Supabase odbieramy.
-- - Spójność właściciela na poziomie kluczy obcych: raport należy do klienta tego samego właściciela,
--   link do raportu tego samego właściciela — niezależnie od RLS.
-- - Publiczny odczyt raportu tylko przez get_shared_report(token): bez identyfikatorów, z licznikiem wyświetleń.

create type public.plan_t as enum ('free', 'solo');
create type public.industry_t as enum ('salon', 'restauracja', 'gabinet', 'sklep', 'inne');
create type public.report_status_t as enum ('draft', 'ready', 'sent');

-- ---------- profile ----------

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  brand_name text check (char_length(brand_name) <= 80),
  -- Ścieżka w prywatnym zasobniku „logos”: {owner_id}/logo.{png|jpg|webp}. Ustawia ją tylko serwer.
  logo_path text check (logo_path ~ '^[0-9a-f-]{36}/logo\.(png|jpg|webp)$'),
  plan public.plan_t not null default 'free',
  plan_renews_at timestamptz,
  stripe_customer_id text unique,
  created_at timestamptz not null default now()
);

-- ---------- klienci ----------

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  industry public.industry_t not null default 'inne',
  -- Pierwszy klient w planie darmowym (PROMPT.md §9). Ustawia trigger, nie użytkownik.
  included_in_free boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);

create index clients_owner_idx on public.clients (owner_id, created_at);
create unique index clients_one_free_per_owner on public.clients (owner_id) where included_in_free;

-- ---------- raporty ----------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  client_id uuid not null,
  period date not null check (extract(day from period) = 1),
  status public.report_status_t not null default 'draft',
  -- ReportData (lib/report/types.ts): tylko liczby zagregowane i komentarz, bez wierszy pliku i opisów.
  -- Kształt sprawdza zod w Server Action; tu tylko typ i górny limit rozmiaru.
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 65536),
  unlocked boolean not null default false,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, period),
  unique (id, owner_id),
  foreign key (client_id, owner_id) references public.clients (id, owner_id) on delete cascade,
  check ((status = 'sent') = (sent_at is not null))
);

create index reports_owner_period_idx on public.reports (owner_id, period desc);

-- ---------- linki ----------

create table public.share_links (
  -- 22 znaki base62 z CSPRNG (≥ 128 bitów), generuje serwer (lib/links/token.ts).
  token text primary key check (token ~ '^[0-9A-Za-z]{22}$'),
  report_id uuid not null,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '12 months',
  revoked_at timestamptz,
  views integer not null default 0 check (views >= 0),
  foreign key (report_id, owner_id) references public.reports (id, owner_id) on delete cascade
);

create index share_links_report_idx on public.share_links (report_id, created_at desc);

-- Zdarzenia z Fazy 1: właściciel po usunięciu konta znika z analityki (anonimizacja, RODO).
alter table public.events
  add constraint events_owner_fk foreign key (owner_id) references public.profiles (id) on delete set null;

-- ---------- triggery ----------

-- Profil powstaje, gdy adres e-mail jest potwierdzony (kliknięty link), nie przy samej prośbie o link.
create function public.handle_user_confirmed() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null
     and (tg_op = 'INSERT' or old.email_confirmed_at is null) then
    insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
    if found then
      insert into public.events (name, owner_id, props) values ('signup_completed', new.id, '{}'::jsonb);
    end if;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_confirmed
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.handle_user_confirmed();

-- Pierwszy klient właściciela jest „w planie darmowym”. Blokada doradcza chroni przed wyścigiem
-- (dwa równoczesne zapisy), a indeks częściowy i tak pilnuje najwyżej jednego takiego klienta.
create function public.clients_set_included_in_free() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));
  new.included_in_free := not exists (select 1 from public.clients c where c.owner_id = new.owner_id);
  return new;
end;
$$;

create trigger clients_included_in_free
  before insert on public.clients
  for each row execute function public.clients_set_included_in_free();

create function public.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger reports_touch_updated_at
  before update on public.reports
  for each row execute function public.touch_updated_at();

-- ---------- RLS ----------

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.reports enable row level security;
alter table public.share_links enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy clients_select_own on public.clients
  for select to authenticated using (owner_id = (select auth.uid()));
create policy clients_insert_own on public.clients
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy clients_update_own on public.clients
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy reports_select_own on public.reports
  for select to authenticated using (owner_id = (select auth.uid()));
create policy reports_insert_own on public.reports
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy reports_update_own on public.reports
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy share_links_select_own on public.share_links
  for select to authenticated using (owner_id = (select auth.uid()));
create policy share_links_insert_own on public.share_links
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy share_links_update_own on public.share_links
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- ---------- granty (druga warstwa) ----------

revoke all on table public.profiles, public.clients, public.reports, public.share_links from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, brand_name) on table public.profiles to authenticated;

grant select on table public.clients to authenticated;
grant insert (name, industry) on table public.clients to authenticated;
grant update (name, industry, archived_at) on table public.clients to authenticated;

grant select on table public.reports to authenticated;
grant insert (client_id, period, status, data, sent_at) on table public.reports to authenticated;
grant update (status, data, sent_at) on table public.reports to authenticated;

grant select on table public.share_links to authenticated;
grant insert (token, report_id) on table public.share_links to authenticated;
grant update (revoked_at) on table public.share_links to authenticated;

revoke all on function public.handle_user_confirmed() from public, anon, authenticated;
revoke all on function public.clients_set_included_in_free() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

-- ---------- publiczny odczyt raportu ----------

-- Zwraca { data, branding, hasLogo } tylko dla linku nieodwołanego i nieprzeterminowanego i zwiększa
-- licznik wyświetleń. Żadnych identyfikatorów (raportu, klienta, właściciela, ścieżki logo).
create function public.get_shared_report(p_token text) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_token is null or p_token !~ '^[0-9A-Za-z]{22}$' then
    return null;
  end if;

  update public.share_links l
     set views = l.views + 1
   where l.token = p_token
     and l.revoked_at is null
     and l.expires_at > now()
  returning (
    select jsonb_build_object(
      'data', r.data,
      'branding', coalesce(r.data ->> 'branding', 'sedno-footer'),
      'hasLogo', p.logo_path is not null
    )
    from public.reports r
    join public.profiles p on p.id = r.owner_id
    where r.id = l.report_id
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_shared_report(text) from public;
grant execute on function public.get_shared_report(text) to anon, authenticated, service_role;

-- ---------- magazyn logo ----------

-- Prywatny zasobnik „logos” (tylko PNG/JPEG/WebP do 2 MB, bez SVG). Bez polityk na storage.objects:
-- pliki zapisuje i czyta wyłącznie serwer kluczem serwisowym po sprawdzeniu właściciela.
-- Lokalny stos bez Dockera nie ma schematu storage (magazyn emuluje bramka) — wtedy pomijamy.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('logos', 'logos', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do nothing;
  end if;
end;
$$;

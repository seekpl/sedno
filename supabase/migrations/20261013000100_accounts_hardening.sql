-- Utwardzenie kont po przeglądzie adwersaryjnym (Faza 2; docs/decisions.md — bezpieczeństwo bazy).
--
-- Tylko zaostrzenia: ograniczenia, triggery i funkcje. Bez nowych, usuniętych ani przemianowanych kolumn
-- i bez zmian typów, więc lib/supabase/database.types.ts zostaje bez zmian. Każdą poprawkę sprawdza test
-- w tests/db/security-*.test.ts, który bez niej nie przechodzi.
--
-- Model zagrożenia: zalogowany użytkownik zna swój token dostępu (ciasteczko sesji należy do niego) i może
-- wołać PostgREST bezpośrednio, z pominięciem aplikacji, jej walidacji zod i limitów zapytań.

-- ---------- 1. Nazwy ----------

-- Stary warunek liczył długość po btrim(), więc przepuszczał „a” z milionem spacji na końcu (dowolnie duży
-- wiersz). Aplikacja zwija białe znaki i usuwa znaki sterujące (lib/data/panel.ts, lib/data/profile.ts);
-- baza pilnuje tego samego niezależnie od niej.
alter table public.clients
  add constraint clients_name_max_length check (char_length(name) <= 80),
  add constraint clients_name_no_control check (name !~ '[\u0001-\u001f\u007f-\u009f]');

alter table public.profiles
  add constraint profiles_display_name_no_control check (display_name !~ '[\u0001-\u001f\u007f-\u009f]'),
  add constraint profiles_brand_name_no_control check (brand_name !~ '[\u0001-\u001f\u007f-\u009f]'),
  -- Logo tylko we własnym katalogu zasobnika: błąd serwera nie podepnie cudzego pliku pod profil
  -- (trasy /app/logo i /r/{token}/logo czytają plik spod logo_path kluczem serwisowym).
  add constraint profiles_logo_path_own_folder check (logo_path is null or left(logo_path, 37) = id::text || '/');

-- ---------- 2. Daty skończone i w rozsądnym zakresie ----------

-- extract(day from 'infinity') to NULL, a warunek z wynikiem NULL przechodzi — „infinity” omijało warunek
-- „pierwszy dzień miesiąca”. Zakres lat ogranicza też liczbę raportów jednego klienta.
alter table public.reports
  add constraint reports_period_range check (period between date '2000-01-01' and date '2099-12-01'),
  add constraint reports_sent_at_finite check (sent_at is null or isfinite(sent_at));

alter table public.clients
  add constraint clients_archived_at_finite check (archived_at is null or isfinite(archived_at));

-- ---------- 3. Unikalność raportu bez wyroczni istnienia cudzych danych ----------

-- unique (client_id, period) sprawdzał się przed kluczem obcym z właścicielem: wstawienie raportu z cudzym
-- client_id dawało 23505 („już istnieje”), gdy właściciel miał raport za ten miesiąc, a 23503, gdy nie miał
-- (upsert z ignore-duplicates: 201 albo 409). Klucz obcy (client_id, owner_id) → clients (id, owner_id)
-- wyznacza owner_id z client_id, więc unikalność (owner_id, client_id, period) jest równoważna dla
-- poprawnych wierszy, a cudzy wiersz nigdy z nią nie koliduje — zostaje zawsze 23503.
alter table public.reports drop constraint reports_client_id_period_key;
alter table public.reports
  add constraint reports_owner_client_period_key unique (owner_id, client_id, period);

-- ---------- 4. „Wyłącz link” jest ostateczne ----------

-- Grant update (revoked_at) pozwalał ustawić revoked_at z powrotem na null i włączyć wyłączony link.
-- Teraz: raz ustawionego revoked_at nie da się zmienić (także kluczem serwisowym), a chwilę wyłączenia
-- ustawia baza (now()), nie klient.
create function public.share_links_revoke_is_final() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.revoked_at is not null then
    if new.revoked_at is distinct from old.revoked_at then
      raise exception 'Wyłączonego linku nie można włączyć ani zmienić.' using errcode = '42501';
    end if;
  elsif new.revoked_at is not null then
    new.revoked_at := now();
  end if;
  return new;
end;
$$;

create trigger share_links_revoke_is_final
  before update of revoked_at on public.share_links
  for each row execute function public.share_links_revoke_is_final();

-- ---------- 5. Limity na konto ----------

-- Bez nich jedno konto mogło przez PostgREST wstawiać klientów, raporty i linki bez końca (limity zapytań
-- działają tylko w aplikacji). Wartości są wysokie — zwykły użytkownik ich nie osiągnie. Blokada doradcza
-- na właściciela (dla klientów ta sama co w clients_set_included_in_free) sprawia, że równoległe wstawienia
-- nie przekroczą limitu. Funkcje działają z uprawnieniami wywołującego (RLS i tak zawęża do jego wierszy).
create function public.clients_enforce_quota() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));
  if (select count(*) from public.clients c where c.owner_id = new.owner_id) >= 500 then
    raise exception 'Limit klientów na konto: 500.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger clients_enforce_quota
  before insert on public.clients
  for each row execute function public.clients_enforce_quota();

create function public.reports_enforce_quota() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('reports:' || new.owner_id::text, 0));
  if (select count(*) from public.reports r where r.owner_id = new.owner_id) >= 10000 then
    raise exception 'Limit raportów na konto: 10 000.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger reports_enforce_quota
  before insert on public.reports
  for each row execute function public.reports_enforce_quota();

create function public.share_links_enforce_quota() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('share_links:' || new.report_id::text, 0));
  if (select count(*) from public.share_links l where l.report_id = new.report_id) >= 100 then
    raise exception 'Limit linków do jednego raportu: 100.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger share_links_enforce_quota
  before insert on public.share_links
  for each row execute function public.share_links_enforce_quota();

-- Funkcje triggerów nie są do wołania przez API (domyślne granty Supabase dają je rolom klienckim).
revoke all on function public.share_links_revoke_is_final() from public, anon, authenticated;
revoke all on function public.clients_enforce_quota() from public, anon, authenticated;
revoke all on function public.reports_enforce_quota() from public, anon, authenticated;
revoke all on function public.share_links_enforce_quota() from public, anon, authenticated;

-- ---------- 6. Licznik wyświetleń bez przepełnienia ----------

-- Ta sama funkcja co w 20261013000000, z jedną zmianą: licznik zatrzymuje się na największej wartości
-- integer zamiast rzucać błąd „integer out of range” (inaczej link z ogromną liczbą otwarć — np. przez
-- bezpośrednie wywołania RPC kluczem anon, z pominięciem limitu aplikacji — przestałby działać).
create or replace function public.get_shared_report(p_token text) returns jsonb
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
     set views = least(l.views, 2147483646) + 1
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

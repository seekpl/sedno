-- Role i schematy jak w obrazie supabase/postgres — tylko lokalny stos bez Dockera (scripts/local-supabase).
-- Na Supabase w chmurze to wszystko już istnieje; tego pliku nie uruchamiamy na produkcji.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
-- Hasło tylko lokalne (połączenia wyłącznie z 127.0.0.1).
create role authenticator login noinherit password 'postgres';
grant anon, authenticated, service_role to authenticator;
alter role authenticator set statement_timeout = '8s';

create role supabase_auth_admin login createrole noinherit password 'postgres';
create role dashboard_user nologin createrole createdb replication;
create schema auth authorization supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role;
alter role supabase_auth_admin set search_path to auth;

create schema extensions;
create extension pgcrypto with schema extensions;
create extension "uuid-ossp" with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- Domyślne uprawnienia Supabase: role klienckie dostają wszystko w public, a granicą jest RLS.
-- Lokalnie odtwarzamy to samo, żeby testy RLS nie przechodziły dzięki brakującym grantom.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema supabase_migrations;
create table supabase_migrations.schema_migrations (
  version text primary key,
  name text,
  statements text[]
);

/**
 * Lokalny stos Supabase bez Dockera (docs/decisions.md, p. 92): Postgres z systemu + przypięte binaria
 * Supabase Auth (GoTrue), PostgREST i Mailpit + bramka Node pod jednym adresem jak w Supabase.
 * Tylko rozwój i testy. Klucze i sekret JWT są publicznymi wartościami deweloperskimi Supabase CLI.
 */
import { createHmac } from 'node:crypto';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '../..');
/** Binaria, logi, pliki logo i stan procesów (w .gitignore). */
export const STATE_DIR = path.join(ROOT, '.supabase-local');

export const PORTS = {
  /** Bramka: /auth/v1, /rest/v1, /storage/v1 — NEXT_PUBLIC_SUPABASE_URL. */
  gateway: 54321,
  db: 54322,
  mailpitHttp: 54324,
  mailpitSmtp: 54325,
  auth: 54331,
  rest: 54332,
} as const;

export const HOST = '127.0.0.1';
export const SUPABASE_URL = `http://${HOST}:${PORTS.gateway}`;
export const DB_URL = `postgresql://postgres@${HOST}:${PORTS.db}/postgres`;
export const MAILPIT_URL = `http://${HOST}:${PORTS.mailpitHttp}`;

/** Adres aplikacji, do którego prowadzą linki z e-maili (serwer e2e). */
export const SITE_URL = process.env.SEDNO_LOCAL_SITE_URL ?? 'http://localhost:3100';

/** Sekret JWT lokalnego stosu (wartość domyślna Supabase CLI, publiczna — nigdy na produkcji). */
export const JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';

/** Czas ważności linku logowania w sekundach (tekst auth.checkInbox mówi „przez godzinę”). */
export const OTP_EXPIRY_SECONDS = 3600;

type Binary = { name: 'auth' | 'postgrest' | 'mailpit'; version: string; url: string; sha256: string };

/** Przypięte wersje i sumy kontrolne (sprawdzone 13.10.2026). */
export const BINARIES: readonly Binary[] = [
  {
    name: 'auth',
    version: 'v2.180.0',
    url: 'https://github.com/supabase/auth/releases/download/v2.180.0/auth-v2.180.0-x86.tar.gz',
    sha256: '3fe064281f5cf7bda94251a3bd9e87a690d081381d9ea93b1491163735209e2e',
  },
  {
    name: 'postgrest',
    version: 'v13.0.7',
    url: 'https://github.com/PostgREST/postgrest/releases/download/v13.0.7/postgrest-v13.0.7-linux-static-x86-64.tar.xz',
    sha256: '4153f81ccc40e7b735edc89cd84b49da25ba27eb37d57c7f6a82c9005a0b762b',
  },
  {
    name: 'mailpit',
    version: 'v1.31.5',
    url: 'https://github.com/axllent/mailpit/releases/download/v1.31.5/mailpit-linux-amd64.tar.gz',
    sha256: '5924ace84f38c83c29f941a644a2d7be6c11f339eb4a9a12ab526414897ceed1',
  },
];

const base64url = (input: string | Buffer) => Buffer.from(input).toString('base64url');

/** JWT HS256 podpisany sekretem lokalnego stosu. */
export function signJwt(payload: Record<string, unknown>, secret = JWT_SECRET): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

/** Klucze jak w Supabase CLI (te same treści, więc te same wartości co w dokumentacji Supabase). */
export const ANON_KEY = signJwt({ iss: 'supabase-demo', role: 'anon', exp: 1983812996 });
export const SERVICE_ROLE_KEY = signJwt({ iss: 'supabase-demo', role: 'service_role', exp: 1983812996 });

/**
 * Katalog danych Postgresa. Postgres nie działa jako root, więc w kontenerze uruchamiamy go jako
 * użytkownik „postgres” w katalogu, do którego ten użytkownik ma dostęp.
 */
export function pgDataDir(): string {
  if (process.env.SEDNO_PGDATA) return process.env.SEDNO_PGDATA;
  if (isRoot()) return '/var/tmp/sedno-local-supabase/pgdata';
  return path.join(STATE_DIR, 'pgdata');
}

export function isRoot(): boolean {
  return typeof process.getuid === 'function' && process.getuid() === 0;
}

/** Zmienne dla aplikacji i testów (pnpm supabase:local env). */
export function appEnv(): Record<string, string> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    SUPABASE_DB_URL: DB_URL,
    SEDNO_MAILPIT_URL: MAILPIT_URL,
  };
}

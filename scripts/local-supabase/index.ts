/**
 * pnpm supabase:local <start|stop|status|reset|env>
 *
 * Lokalny stos Supabase bez Dockera (docs/decisions.md, p. 92) do rozwoju, testów RLS i e2e:
 * Postgres z systemu (initdb/pg_ctl), Supabase Auth (GoTrue), PostgREST, Mailpit (przechwytuje e-maile
 * z linkiem logowania) i bramka pod jednym adresem jak w Supabase (scripts/local-supabase/gateway.ts).
 * Migracje z supabase/migrations stosujemy tak jak Supabase CLI (tabela supabase_migrations.schema_migrations).
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import {
  BINARIES,
  DB_URL,
  HOST,
  JWT_SECRET,
  MAILPIT_URL,
  OTP_EXPIRY_SECONDS,
  PORTS,
  ROOT,
  SITE_URL,
  STATE_DIR,
  SUPABASE_URL,
  appEnv,
  isRoot,
  pgDataDir,
} from './config';

const BIN_DIR = path.join(STATE_DIR, 'bin');
const LOG_DIR = path.join(STATE_DIR, 'logs');
const PIDS_FILE = path.join(STATE_DIR, 'pids.json');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const BOOTSTRAP_SQL = path.join(ROOT, 'supabase', 'local', 'bootstrap.sql');
const SUBJECTS_FILE = path.join(ROOT, 'supabase', 'templates', 'subjects.json');

type Service = 'mailpit' | 'auth' | 'rest' | 'gateway';
type Env = Record<string, string | undefined>;

function log(message: string) {
  process.stdout.write(`[supabase:local] ${message}\n`);
}

function fail(message: string): never {
  process.stderr.write(`[supabase:local] ${message}\n`);
  process.exit(1);
}

/* ---------- binaria ---------- */

function binaryDir(name: string, version: string) {
  return path.join(BIN_DIR, `${name}-${version}`);
}

async function ensureBinaries() {
  mkdirSync(BIN_DIR, { recursive: true });
  for (const binary of BINARIES) {
    const dir = binaryDir(binary.name, binary.version);
    if (existsSync(path.join(dir, binary.name))) continue;
    log(`pobieram ${binary.name} ${binary.version}`);
    const response = await fetch(binary.url);
    if (!response.ok) fail(`nie udało się pobrać ${binary.url} (HTTP ${response.status})`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (sha !== binary.sha256) fail(`zła suma kontrolna ${binary.name}: ${sha}`);
    mkdirSync(dir, { recursive: true });
    const archive = path.join(dir, path.basename(new URL(binary.url).pathname));
    writeFileSync(archive, bytes);
    const flags = archive.endsWith('.tar.xz') ? 'xJf' : 'xzf';
    run('tar', [flags, archive, '-C', dir]);
    rmSync(archive);
  }
}

function binary(name: 'auth' | 'postgrest' | 'mailpit') {
  const entry = BINARIES.find((b) => b.name === name)!;
  return path.join(binaryDir(entry.name, entry.version), name);
}

/* ---------- Postgres ---------- */

function pgBinDir(): string {
  if (process.env.SEDNO_PG_BINDIR) return process.env.SEDNO_PG_BINDIR;
  const base = '/usr/lib/postgresql';
  if (existsSync(base)) {
    const versions = readdirSync(base)
      .filter((v) => existsSync(path.join(base, v, 'bin', 'postgres')))
      .sort((a, b) => Number(b) - Number(a));
    if (versions[0] && Number(versions[0]) >= 15) return path.join(base, versions[0], 'bin');
  }
  const pgConfig = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
  if (pgConfig.status === 0) return pgConfig.stdout.trim();
  fail('nie znaleziono Postgresa ≥ 15 (ustaw SEDNO_PG_BINDIR)');
}

/** Polecenie Postgresa: jako root przez runuser jako użytkownik „postgres” (Postgres odmawia działania jako root). */
function runPg(command: string, args: string[], options: { allowFail?: boolean } = {}) {
  const exe = path.join(pgBinDir(), command);
  return isRoot() ? run('runuser', ['-u', 'postgres', '--', exe, ...args], options) : run(exe, args, options);
}

function run(command: string, args: string[], { allowFail = false } = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0 && !allowFail) {
    fail(`${command} ${args.join(' ')} — ${result.stderr || result.stdout}`);
  }
  return result;
}

function socketDir() {
  return path.dirname(pgDataDir());
}

function initDatabase(): boolean {
  const data = pgDataDir();
  if (existsSync(path.join(data, 'PG_VERSION'))) return false;
  mkdirSync(socketDir(), { recursive: true });
  if (isRoot()) run('chown', ['postgres:postgres', socketDir()]);
  log(`initdb ${data}`);
  runPg('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C.UTF-8']);
  return true;
}

function pgRunning(): boolean {
  return runPg('pg_ctl', ['-D', pgDataDir(), 'status'], { allowFail: true }).status === 0;
}

function startPostgres() {
  if (pgRunning()) return;
  const options = `-p ${PORTS.db} -k ${socketDir()} -c listen_addresses=${HOST} -c fsync=off`;
  runPg('pg_ctl', [
    '-D',
    pgDataDir(),
    '-o',
    options,
    '-l',
    path.join(socketDir(), 'postgres.log'),
    '-w',
    'start',
  ]);
}

async function withDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function bootstrap() {
  await withDb(async (db) => {
    const { rowCount } = await db.query("select 1 from pg_roles where rolname = 'authenticator'");
    if (rowCount) return;
    log('role i schematy Supabase');
    await db.query(readFileSync(BOOTSTRAP_SQL, 'utf8'));
  });
}

function authEnv(): Env {
  const subjects = existsSync(SUBJECTS_FILE)
    ? (JSON.parse(readFileSync(SUBJECTS_FILE, 'utf8')) as Record<string, string>)
    : {};
  const templates = (name: string) => `${SUPABASE_URL}/templates/${name}.html`;
  return {
    PATH: process.env.PATH,
    GOTRUE_DB_DRIVER: 'postgres',
    DATABASE_URL: `postgres://supabase_auth_admin:postgres@${HOST}:${PORTS.db}/postgres`,
    GOTRUE_DB_MIGRATIONS_PATH: path.join(path.dirname(binary('auth')), 'migrations'),
    // Jak w Supabase CLI: zewnętrzny adres to bramka, a linki z e-maili prowadzą przez /auth/v1/verify.
    API_EXTERNAL_URL: SUPABASE_URL,
    GOTRUE_MAILER_URLPATHS_CONFIRMATION: '/auth/v1/verify',
    GOTRUE_MAILER_URLPATHS_INVITE: '/auth/v1/verify',
    GOTRUE_MAILER_URLPATHS_RECOVERY: '/auth/v1/verify',
    GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: '/auth/v1/verify',
    GOTRUE_API_HOST: HOST,
    PORT: String(PORTS.auth),
    GOTRUE_SITE_URL: SITE_URL,
    GOTRUE_URI_ALLOW_LIST: `${SITE_URL}/**,http://localhost:3000/**,http://localhost:3101/**`,
    GOTRUE_JWT_SECRET: JWT_SECRET,
    GOTRUE_JWT_EXP: '3600',
    GOTRUE_JWT_AUD: 'authenticated',
    GOTRUE_JWT_ADMIN_ROLES: 'service_role',
    // Rola w tokenie sesji (claim „role”) — jak w Supabase; bez tego GoTrue wydaje role "" i PostgREST odrzuca token.
    GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
    GOTRUE_DISABLE_SIGNUP: 'false',
    GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
    GOTRUE_MAILER_AUTOCONFIRM: 'false',
    GOTRUE_MAILER_OTP_EXP: String(OTP_EXPIRY_SECONDS),
    GOTRUE_SMTP_HOST: HOST,
    GOTRUE_SMTP_PORT: String(PORTS.mailpitSmtp),
    GOTRUE_SMTP_ADMIN_EMAIL: 'logowanie@sedno.local',
    GOTRUE_SMTP_SENDER_NAME: 'Sedno',
    // Lokalnie bez limitu e-maili (testy e2e logują wielu użytkowników); limity aplikacji działają dalej.
    GOTRUE_RATE_LIMIT_EMAIL_SENT: '1000',
    GOTRUE_SMTP_MAX_FREQUENCY: '1s',
    GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: templates('magic-link'),
    GOTRUE_MAILER_TEMPLATES_CONFIRMATION: templates('confirmation'),
    ...(subjects.magicLink ? { GOTRUE_MAILER_SUBJECTS_MAGIC_LINK: subjects.magicLink } : {}),
    ...(subjects.confirmation ? { GOTRUE_MAILER_SUBJECTS_CONFIRMATION: subjects.confirmation } : {}),
    GOTRUE_LOG_LEVEL: 'warn',
  };
}

function migrateAuth() {
  const result = spawnSync(binary('auth'), ['migrate'], {
    env: authEnv() as NodeJS.ProcessEnv,
    encoding: 'utf8',
  });
  if (result.status !== 0) fail(`migracje Supabase Auth: ${result.stderr || result.stdout}`);
}

/** Migracje aplikacji w kolejności nazw, każda w transakcji, raz (jak Supabase CLI). */
async function migrateApp() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{14}_.+\.sql$/.test(f))
    .sort();
  await withDb(async (db) => {
    const { rows } = await db.query<{ version: string }>(
      'select version from supabase_migrations.schema_migrations',
    );
    const applied = new Set(rows.map((r) => r.version));
    for (const file of files) {
      const version = file.slice(0, 14);
      if (applied.has(version)) continue;
      log(`migracja ${file}`);
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await db.query('begin');
        await db.query(sql);
        await db.query('insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)', [
          version,
          file.slice(15, -4),
        ]);
        await db.query('commit');
      } catch (error) {
        await db.query('rollback');
        fail(`migracja ${file}: ${(error as Error).message}`);
      }
    }
    await db.query("notify pgrst, 'reload schema'");
  });
}

/* ---------- usługi ---------- */

function readPids(): Partial<Record<Service, number>> {
  if (!existsSync(PIDS_FILE)) return {};
  return JSON.parse(readFileSync(PIDS_FILE, 'utf8')) as Partial<Record<Service, number>>;
}

function alive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function spawnService(name: Service, command: string, args: string[], env: Env) {
  mkdirSync(LOG_DIR, { recursive: true });
  const out = openSync(path.join(LOG_DIR, `${name}.log`), 'a');
  const child = spawn(command, args, {
    env: env as NodeJS.ProcessEnv,
    detached: true,
    stdio: ['ignore', out, out],
  });
  child.unref();
  return child.pid!;
}

function postgrestConfig(): string {
  const file = path.join(STATE_DIR, 'postgrest.conf');
  writeFileSync(
    file,
    [
      `db-uri = "postgres://authenticator:postgres@${HOST}:${PORTS.db}/postgres"`,
      'db-schemas = "public"',
      'db-anon-role = "anon"',
      `jwt-secret = "${JWT_SECRET}"`,
      `server-host = "${HOST}"`,
      `server-port = ${PORTS.rest}`,
      'db-extra-search-path = "public, extensions"',
      'log-level = "warn"',
      '',
    ].join('\n'),
  );
  return file;
}

async function waitFor(url: string, label: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // jeszcze nie słucha
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  fail(`${label} nie odpowiada pod ${url} (logi: ${LOG_DIR})`);
}

async function startServices() {
  const pids = readPids();
  const env = { PATH: process.env.PATH };
  if (!alive(pids.mailpit)) {
    pids.mailpit = spawnService(
      'mailpit',
      binary('mailpit'),
      [
        '--smtp',
        `${HOST}:${PORTS.mailpitSmtp}`,
        '--listen',
        `${HOST}:${PORTS.mailpitHttp}`,
        '--disable-version-check',
        '--smtp-auth-accept-any',
        '--smtp-auth-allow-insecure',
      ],
      env,
    );
  }
  if (!alive(pids.gateway)) {
    pids.gateway = spawnService(
      'gateway',
      process.execPath,
      ['--import', 'tsx', path.join(import.meta.dirname, 'gateway.ts')],
      { ...process.env },
    );
  }
  if (!alive(pids.auth)) pids.auth = spawnService('auth', binary('auth'), ['serve'], authEnv());
  if (!alive(pids.rest)) pids.rest = spawnService('rest', binary('postgrest'), [postgrestConfig()], env);
  writeFileSync(PIDS_FILE, JSON.stringify(pids, null, 2));

  await waitFor(`${MAILPIT_URL}/api/v1/info`, 'Mailpit');
  await waitFor(`${SUPABASE_URL}/health`, 'Bramka');
  await waitFor(`${SUPABASE_URL}/auth/v1/health`, 'Supabase Auth');
  await waitFor(`${SUPABASE_URL}/rest/v1/`, 'PostgREST');
}

function stopServices() {
  const pids = readPids();
  for (const [name, pid] of Object.entries(pids)) {
    if (!alive(pid)) continue;
    try {
      process.kill(pid!, 'SIGTERM');
      log(`zatrzymano ${name}`);
    } catch {
      // już nie działa
    }
  }
  rmSync(PIDS_FILE, { force: true });
}

/* ---------- polecenia ---------- */

async function start() {
  await ensureBinaries();
  const fresh = initDatabase();
  startPostgres();
  await bootstrap();
  migrateAuth();
  await migrateApp();
  await startServices();
  log(`gotowe${fresh ? ' (nowa baza)' : ''}: ${SUPABASE_URL}, e-maile: ${MAILPIT_URL}`);
}

function stop() {
  stopServices();
  if (existsSync(path.join(pgDataDir(), 'PG_VERSION')) && pgRunning()) {
    runPg('pg_ctl', ['-D', pgDataDir(), '-m', 'fast', '-w', 'stop']);
    log('zatrzymano Postgres');
  }
}

async function reset() {
  stop();
  rmSync(pgDataDir(), { recursive: true, force: true });
  rmSync(path.join(STATE_DIR, 'storage'), { recursive: true, force: true });
  await start();
}

function status() {
  const pids = readPids();
  for (const name of ['mailpit', 'gateway', 'auth', 'rest'] as const) {
    log(`${name}: ${alive(pids[name]) ? `działa (pid ${pids[name]})` : 'nie działa'}`);
  }
  log(
    `postgres: ${existsSync(path.join(pgDataDir(), 'PG_VERSION')) && pgRunning() ? 'działa' : 'nie działa'}`,
  );
}

function printEnv() {
  for (const [key, value] of Object.entries(appEnv())) process.stdout.write(`${key}=${value}\n`);
}

const command = process.argv[2] ?? 'start';
const commands: Record<string, () => unknown> = { start, stop, status, reset, env: printEnv };
if (!commands[command]) fail(`nieznane polecenie: ${command} (start|stop|status|reset|env)`);
await commands[command]!();

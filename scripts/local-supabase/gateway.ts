/**
 * Bramka lokalnego stosu (zamiast Konga z Supabase): jeden adres jak w Supabase.
 *
 * - /auth/v1/*    → Supabase Auth (GoTrue)
 * - /rest/v1/*    → PostgREST
 * - /storage/v1/* → emulacja Storage API dla prywatnego zasobnika „logos” (tylko to, czego używa aplikacja:
 *                   upload, download, remove, createSignedUrl), pliki w .supabase-local/storage
 * - /templates/*  → szablony e-maili z supabase/templates (Supabase Auth pobiera je przez HTTP)
 *
 * Emulacja magazynu wymaga klucza service_role, tak jak aplikacja go używa (tylko na serwerze, po
 * sprawdzeniu właściciela). Limity zasobnika jak w migracji: PNG/JPEG/WebP, do 2 MB.
 *
 * Utwardzenie (docs/decisions.md, Faza 2 — bezpieczeństwo stosu): klucz obiektu bez „..”, „.”, pustych
 * segmentów, znaków sterujących i ukośnika wstecznego (także po zdekodowaniu %2e%2e, %2f), ścieżka zawsze
 * wewnątrz katalogu zasobnika, nazwy *.meta.json zarezerwowane dla metadanych emulatora, tylko znane
 * zasobniki (bez dziedziczonych kluczy obiektu), JWT HS256 z poprawnym JSON-em, podpisany adres zawsze
 * z czasem ważności, limit rozmiaru czytany strumieniowo (bez buforowania nadmiarowych bajtów), typ
 * odpowiedzi tylko z listy zasobnika i `nosniff`. Błąd jednego żądania nie wyłącza bramki.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { HOST, JWT_SECRET, PORTS, ROOT, STATE_DIR, signJwt } from './config';

type Bucket = { maxBytes: number; mime: readonly string[] };

export const BUCKETS: Readonly<Record<string, Bucket>> = {
  logos: { maxBytes: 2 * 1024 * 1024, mime: ['image/png', 'image/jpeg', 'image/webp'] },
};

/** Najdłuższy klucz obiektu (jak w Supabase Storage: 1024 znaki). */
const MAX_KEY_LENGTH = 1024;
/** Ciało żądań JSON (podpis, usuwanie) — małe. */
const MAX_JSON_BYTES = 64 * 1024;
/** Najwięcej obiektów w jednym usunięciu (jak w Supabase Storage). */
const MAX_REMOVE = 1000;
/** Najdłuższa ważność podpisanego adresu: rok (aplikacja nie używa dłuższych). */
const MAX_SIGNED_SECONDS = 365 * 24 * 3600;
const META_SUFFIX = '.meta.json';

export type GatewayOptions = {
  storageDir: string;
  templatesDir: string;
  upstream: { host: string; auth: number; rest: number };
  jwtSecret: string;
};

export const defaultGatewayOptions = (): GatewayOptions => ({
  storageDir: path.join(STATE_DIR, 'storage'),
  templatesDir: path.join(ROOT, 'supabase', 'templates'),
  upstream: { host: HOST, auth: PORTS.auth, rest: PORTS.rest },
  jwtSecret: JWT_SECRET,
});

type Claims = { role?: unknown; exp?: unknown; url?: unknown };

/** JWT HS256 podpisany sekretem stosu albo null (zły format, inny algorytm, zły podpis, wygasły). */
export function verifyJwt(token: string, secret = JWT_SECRET): Claims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts as [string, string, string];
  if (!header || !body || !signature) return null;
  try {
    const head = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as { alg?: unknown };
    if (head?.alg !== 'HS256') return null;
    const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest();
    const given = Buffer.from(signature, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as unknown;
    if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return null;
    const { exp } = claims as Claims;
    if (exp !== undefined && (typeof exp !== 'number' || !Number.isFinite(exp))) return null;
    if (typeof exp === 'number' && exp * 1000 < Date.now()) return null;
    return claims as Claims;
  } catch {
    return null;
  }
}

function bearer(req: http.IncomingMessage, secret: string): Claims | null {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token ? verifyJwt(token, secret) : null;
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  if (res.headersSent) return void res.destroy();
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function storageError(res: http.ServerResponse, status: number, error: string, message: string) {
  json(res, status, { statusCode: String(status), error, message });
}

class TooLarge extends Error {}

/**
 * Ciało żądania do `limit` bajtów. Większe → TooLarge, ale dopiero po odczytaniu reszty bez zapisywania jej
 * w pamięci (klient dostaje czytelną odpowiedź 413 zamiast zerwanego połączenia).
 */
async function readBody(req: http.IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) chunks.length = 0;
    else chunks.push(chunk as Buffer);
  }
  if (size > limit) throw new TooLarge();
  return Buffer.concat(chunks);
}

/** JSON z ciała żądania albo undefined (zły JSON, za duże ciało). */
async function readJson(req: http.IncomingMessage): Promise<unknown> {
  try {
    return JSON.parse((await readBody(req, MAX_JSON_BYTES)).toString('utf8')) as unknown;
  } catch {
    return undefined;
  }
}

/** Przekazanie do usługi bez wyłączania bramki, gdy klient albo usługa zerwie połączenie. */
function proxy(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  host: string,
  port: number,
  prefix: string,
) {
  const target = (req.url ?? '/').slice(prefix.length) || '/';
  const upstream = http.request(
    { host, port, path: target, method: req.method, headers: { ...req.headers, host: `${host}:${port}` } },
    (up) => {
      if (res.headersSent || res.destroyed) return void up.destroy();
      res.writeHead(up.statusCode ?? 502, up.headers);
      pipeline(up, res, () => undefined);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent && !res.destroyed) {
      res.writeHead(502);
      res.end();
    } else {
      res.destroy();
    }
  });
  res.on('close', () => upstream.destroy());
  pipeline(req, upstream, () => undefined);
}

const isBucket = (name: string): name is keyof typeof BUCKETS => Object.hasOwn(BUCKETS, name);

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Bezpieczny klucz obiektu: zdekodowany raz, bez ukośnika na początku, segmenty bez „.”, „..”, pustych,
 * znaków sterujących i ukośnika wstecznego, bez nazw zarezerwowanych dla metadanych. Null, gdy zły.
 */
export function cleanKey(raw: string): string | null {
  const decoded = decode(raw);
  if (decoded === null) return null;
  const key = decoded.replace(/^\/+/, '');
  if (!key || key.length > MAX_KEY_LENGTH) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(key)) return null;
  const parts = key.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return null;
  if (parts[parts.length - 1]!.endsWith(META_SUFFIX)) return null;
  return key;
}

/** Plik obiektu wewnątrz katalogu zasobnika albo null (zły zasobnik lub klucz). */
export function objectFile(storageDir: string, bucket: string, rawKey: string): string | null {
  if (!isBucket(bucket)) return null;
  const key = cleanKey(rawKey);
  if (key === null) return null;
  const root = path.resolve(storageDir, bucket);
  const file = path.resolve(root, key);
  return file.startsWith(root + path.sep) ? file : null;
}

const metaPath = (file: string) => `${file}${META_SUFFIX}`;

function sendObject(res: http.ServerResponse, bucket: Bucket, file: string) {
  const stat = existsSync(file) ? statSync(file) : null;
  if (!stat?.isFile()) return storageError(res, 404, 'not_found', 'Object not found');
  let contentType = 'application/octet-stream';
  try {
    const meta = JSON.parse(readFileSync(metaPath(file), 'utf8')) as { contentType?: unknown };
    if (typeof meta.contentType === 'string' && bucket.mime.includes(meta.contentType)) {
      contentType = meta.contentType;
    }
  } catch {
    // brak albo uszkodzone metadane: bezpieczny typ ogólny
  }
  const bytes = readFileSync(file);
  res.writeHead(200, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(bytes);
}

async function storage(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  options: GatewayOptions,
) {
  const rest = url.pathname.slice('/storage/v1'.length);
  const { storageDir, jwtSecret } = options;

  // Pobranie przez podpisany adres (bez klucza): /object/sign/{bucket}/{path}?token=...
  const signed = /^\/object\/sign\/([^/]+)\/(.+)$/.exec(rest);
  if (req.method === 'GET' && signed) {
    const [, bucket, rawKey] = signed as unknown as [string, string, string];
    const file = objectFile(storageDir, bucket, rawKey);
    if (!file) return storageError(res, 400, 'invalid_key', 'Invalid key');
    const claims = verifyJwt(url.searchParams.get('token') ?? '', jwtSecret);
    const key = `${bucket}/${cleanKey(rawKey)}`;
    if (!claims || typeof claims.exp !== 'number' || claims.url !== key) {
      return storageError(res, 400, 'InvalidJWT', 'invalid signature');
    }
    return sendObject(res, BUCKETS[bucket]!, file);
  }

  if (bearer(req, jwtSecret)?.role !== 'service_role') {
    return storageError(res, 403, 'Unauthorized', 'Emulacja magazynu przyjmuje tylko klucz service_role.');
  }

  if (req.method === 'POST' && signed) {
    const [, bucket, rawKey] = signed as unknown as [string, string, string];
    if (!objectFile(storageDir, bucket, rawKey)) return storageError(res, 400, 'invalid_key', 'Invalid key');
    const body = (await readJson(req)) as { expiresIn?: unknown } | undefined;
    const expiresIn = body?.expiresIn;
    if (
      typeof expiresIn !== 'number' ||
      !Number.isInteger(expiresIn) ||
      expiresIn < 1 ||
      expiresIn > MAX_SIGNED_SECONDS
    ) {
      return storageError(res, 400, 'invalid_request', 'expiresIn must be a positive number of seconds');
    }
    const key = `${bucket}/${cleanKey(rawKey)}`;
    const token = signJwt({ url: key, exp: Math.floor(Date.now() / 1000) + expiresIn }, jwtSecret);
    return json(res, 200, { signedURL: `/object/sign/${key}?token=${token}` });
  }

  const removeMatch = /^\/object\/([^/]+)$/.exec(rest);
  if (req.method === 'DELETE' && removeMatch) {
    const bucket = removeMatch[1]!;
    if (!isBucket(bucket)) return storageError(res, 404, 'Bucket not found', 'Bucket not found');
    const body = (await readJson(req)) as { prefixes?: unknown } | undefined;
    const prefixes = body?.prefixes;
    if (
      !Array.isArray(prefixes) ||
      prefixes.length > MAX_REMOVE ||
      !prefixes.every((p) => typeof p === 'string')
    ) {
      return storageError(res, 400, 'invalid_request', 'prefixes must be an array of strings');
    }
    const removed = [];
    for (const key of prefixes as string[]) {
      // Klucze w ciele JSON nie są zakodowane procentowo, więc nie dekodujemy ich drugi raz.
      const file = objectFile(storageDir, bucket, encodeURIComponent(key));
      if (file && existsSync(file) && statSync(file).isFile()) {
        rmSync(file);
        rmSync(metaPath(file), { force: true });
        removed.push({ name: key, bucket_id: bucket });
      }
    }
    return json(res, 200, removed);
  }

  const objectMatch = /^\/object\/([^/]+)\/(.+)$/.exec(rest);
  if (!objectMatch) return storageError(res, 404, 'not_found', 'Unknown storage route');
  const [, bucket, rawKey] = objectMatch as unknown as [string, string, string];
  if (!isBucket(bucket)) return storageError(res, 404, 'Bucket not found', 'Bucket not found');
  const config = BUCKETS[bucket]!;
  const file = objectFile(storageDir, bucket, rawKey);
  if (!file) return storageError(res, 400, 'invalid_key', 'Invalid key');

  if (req.method === 'GET') return sendObject(res, config, file);

  if (req.method === 'POST' || req.method === 'PUT') {
    const contentType = String(req.headers['content-type'] ?? '')
      .split(';')[0]!
      .trim()
      .toLowerCase();
    if (!config.mime.includes(contentType)) {
      return storageError(res, 415, 'invalid_mime_type', `mime type ${contentType} is not supported`);
    }
    let body: Buffer;
    try {
      body = await readBody(req, config.maxBytes);
    } catch (error) {
      if (!(error instanceof TooLarge)) throw error;
      return storageError(res, 413, 'Payload too large', 'The object exceeded the maximum allowed size');
    }
    const upsert = req.method === 'PUT' || req.headers['x-upsert'] === 'true';
    if (existsSync(file) && !upsert)
      return storageError(res, 409, 'Duplicate', 'The resource already exists');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
    writeFileSync(metaPath(file), JSON.stringify({ contentType }));
    return json(res, 200, { Key: `${bucket}/${cleanKey(rawKey)}`, Id: randomUUID() });
  }

  return storageError(res, 405, 'method_not_allowed', 'Method not allowed');
}

function template(res: http.ServerResponse, templatesDir: string, name: string) {
  const base = path.basename(name);
  const file = path.join(templatesDir, base);
  if (!/^[a-z-]+\.html$/.test(base) || !existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(readFileSync(file));
}

/** Serwer bramki (bez nasłuchiwania): uruchamia go `pnpm supabase:local start`, testy — na wolnym porcie. */
export function createGateway(options: GatewayOptions = defaultGatewayOptions()): http.Server {
  const server = http.createServer((req, res) => {
    res.on('error', () => res.destroy());
    req.on('error', () => res.destroy());
    let url: URL;
    try {
      url = new URL(req.url ?? '/', `http://${HOST}`);
    } catch {
      res.writeHead(400);
      return void res.end();
    }
    const { upstream } = options;
    if (url.pathname === '/health') return json(res, 200, { ok: true });
    if (url.pathname.startsWith('/auth/v1')) {
      return proxy(req, res, upstream.host, upstream.auth, '/auth/v1');
    }
    if (url.pathname.startsWith('/rest/v1')) {
      return proxy(req, res, upstream.host, upstream.rest, '/rest/v1');
    }
    if (url.pathname.startsWith('/storage/v1')) {
      return void storage(req, res, url, options).catch(() => {
        if (res.headersSent) res.destroy();
        else storageError(res, 500, 'internal', 'Storage emulator error');
      });
    }
    if (url.pathname.startsWith('/templates/')) {
      return template(res, options.templatesDir, url.pathname.slice('/templates/'.length));
    }
    res.writeHead(404);
    res.end();
  });
  server.on('clientError', (_error, socket) => socket.destroy());
  return server;
}

// Uruchomienie jako proces (scripts/local-supabase/index.ts: node --import tsx gateway.ts).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createGateway().listen(PORTS.gateway, HOST);
}

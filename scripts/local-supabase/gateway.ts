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
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { HOST, JWT_SECRET, PORTS, ROOT, STATE_DIR, signJwt } from './config';

const STORAGE_DIR = path.join(STATE_DIR, 'storage');
const TEMPLATES_DIR = path.join(ROOT, 'supabase', 'templates');
const BUCKETS: Record<string, { maxBytes: number; mime: readonly string[] }> = {
  logos: { maxBytes: 2 * 1024 * 1024, mime: ['image/png', 'image/jpeg', 'image/webp'] },
};

type Claims = { role?: string; exp?: number; url?: string };

function verifyJwt(token: string): Claims | null {
  const [header, body, signature] = token.split('.');
  if (!header || !body || !signature) return null;
  const expected = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest();
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Claims;
  if (claims.exp && claims.exp * 1000 < Date.now()) return null;
  return claims;
}

function bearer(req: http.IncomingMessage): Claims | null {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token ? verifyJwt(token) : null;
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function storageError(res: http.ServerResponse, status: number, error: string, message: string) {
  json(res, status, { statusCode: String(status), error, message });
}

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function proxy(req: http.IncomingMessage, res: http.ServerResponse, port: number, prefix: string) {
  const target = (req.url ?? '/').slice(prefix.length) || '/';
  const upstream = http.request(
    {
      host: HOST,
      port,
      path: target,
      method: req.method,
      headers: { ...req.headers, host: `${HOST}:${port}` },
    },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(upstream);
}

/** Ścieżka obiektu w zasobniku bez „..” i bez ukośnika na początku. */
function objectPath(bucket: string, key: string): string | null {
  const clean = decodeURIComponent(key).replace(/^\/+/, '');
  if (!clean || clean.split('/').some((part) => part === '..' || part === '')) return null;
  return path.join(STORAGE_DIR, bucket, clean);
}

function metaPath(file: string) {
  return `${file}.meta.json`;
}

function sendObject(res: http.ServerResponse, file: string) {
  if (!existsSync(file)) return storageError(res, 404, 'not_found', 'Object not found');
  const meta = JSON.parse(readFileSync(metaPath(file), 'utf8')) as { contentType: string };
  res.writeHead(200, { 'content-type': meta.contentType, 'cache-control': 'no-store' });
  res.end(readFileSync(file));
}

async function storage(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const rest = url.pathname.slice('/storage/v1'.length);

  // Pobranie przez podpisany adres (bez klucza): /object/sign/{bucket}/{path}?token=...
  const signed = /^\/object\/sign\/([^/]+)\/(.+)$/.exec(rest);
  if (req.method === 'GET' && signed) {
    const claims = verifyJwt(url.searchParams.get('token') ?? '');
    const key = `${signed[1]}/${decodeURIComponent(signed[2]!)}`;
    if (!claims || claims.url !== key) return storageError(res, 400, 'InvalidJWT', 'invalid signature');
    const file = objectPath(signed[1]!, signed[2]!);
    return file ? sendObject(res, file) : storageError(res, 400, 'invalid_key', 'Invalid key');
  }

  if (bearer(req)?.role !== 'service_role') {
    return storageError(res, 403, 'Unauthorized', 'Emulacja magazynu przyjmuje tylko klucz service_role.');
  }

  if (req.method === 'POST' && signed) {
    const { expiresIn } = JSON.parse((await readBody(req)).toString('utf8')) as { expiresIn: number };
    const key = `${signed[1]}/${decodeURIComponent(signed[2]!)}`;
    const token = signJwt({ url: key, exp: Math.floor(Date.now() / 1000) + Number(expiresIn) });
    return json(res, 200, { signedURL: `/object/sign/${key}?token=${token}` });
  }

  const removeMatch = /^\/object\/([^/]+)$/.exec(rest);
  if (req.method === 'DELETE' && removeMatch) {
    const { prefixes } = JSON.parse((await readBody(req)).toString('utf8')) as { prefixes: string[] };
    const removed = [];
    for (const key of prefixes) {
      const file = objectPath(removeMatch[1]!, key);
      if (file && existsSync(file)) {
        rmSync(file);
        rmSync(metaPath(file), { force: true });
        removed.push({ name: key, bucket_id: removeMatch[1] });
      }
    }
    return json(res, 200, removed);
  }

  const objectMatch = /^\/object\/([^/]+)\/(.+)$/.exec(rest);
  if (!objectMatch) return storageError(res, 404, 'not_found', 'Unknown storage route');
  const [, bucket, key] = objectMatch as unknown as [string, string, string];
  const config = BUCKETS[bucket];
  if (!config) return storageError(res, 404, 'Bucket not found', 'Bucket not found');
  const file = objectPath(bucket, key);
  if (!file) return storageError(res, 400, 'invalid_key', 'Invalid key');

  if (req.method === 'GET') return sendObject(res, file);

  if (req.method === 'POST' || req.method === 'PUT') {
    const contentType = String(req.headers['content-type'] ?? '')
      .split(';')[0]!
      .trim();
    const body = await readBody(req);
    if (!config.mime.includes(contentType)) {
      return storageError(res, 415, 'invalid_mime_type', `mime type ${contentType} is not supported`);
    }
    if (body.length > config.maxBytes) {
      return storageError(res, 413, 'Payload too large', 'The object exceeded the maximum allowed size');
    }
    const upsert = req.method === 'PUT' || req.headers['x-upsert'] === 'true';
    if (existsSync(file) && !upsert)
      return storageError(res, 409, 'Duplicate', 'The resource already exists');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
    writeFileSync(metaPath(file), JSON.stringify({ contentType }));
    return json(res, 200, { Key: `${bucket}/${decodeURIComponent(key)}`, Id: randomUUID() });
  }

  return storageError(res, 405, 'method_not_allowed', 'Method not allowed');
}

function template(res: http.ServerResponse, name: string) {
  const file = path.join(TEMPLATES_DIR, path.basename(name));
  if (!/^[a-z-]+\.html$/.test(path.basename(name)) || !existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(readFileSync(file));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}`);
  if (url.pathname === '/health') return json(res, 200, { ok: true });
  if (url.pathname.startsWith('/auth/v1')) return proxy(req, res, PORTS.auth, '/auth/v1');
  if (url.pathname.startsWith('/rest/v1')) return proxy(req, res, PORTS.rest, '/rest/v1');
  if (url.pathname.startsWith('/storage/v1')) {
    return void storage(req, res, url).catch(() =>
      storageError(res, 500, 'internal', 'Storage emulator error'),
    );
  }
  if (url.pathname.startsWith('/templates/')) return template(res, url.pathname.slice('/templates/'.length));
  res.writeHead(404);
  res.end();
});

server.listen(PORTS.gateway, HOST);

/**
 * Bramka lokalnego stosu Supabase (scripts/local-supabase/gateway.ts) — testy adwersaryjne emulacji magazynu:
 * przejście poza katalog zasobnika (../ i warianty zakodowane), brak albo podrobiony klucz serwisowy,
 * zmienione podpisane adresy, SVG i za duże pliki, zarezerwowane pliki metadanych. Bramka działa w procesie
 * testu na wolnym porcie, z własnym katalogiem i sekretem (bez uruchomionego stosu).
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JWT_SECRET, signJwt } from '../../scripts/local-supabase/config';
import { cleanKey, createGateway, objectFile, verifyJwt } from '../../scripts/local-supabase/gateway';

const SECRET = 'test-gateway-secret-with-at-least-32-characters';
const SECRET_TEXT = 'SEKRET-POZA-ZASOBNIKIEM';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const MAX = 2 * 1024 * 1024;

const now = () => Math.floor(Date.now() / 1000);
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const serviceKey = (secret = SECRET, extra: Record<string, unknown> = {}) =>
  signJwt({ role: 'service_role', exp: now() + 3600, ...extra }, secret);

let root: string;
let storageDir: string;
let server: http.Server;
let port: number;

type Reply = { status: number; headers: http.IncomingHttpHeaders; body: Buffer };

/** Żądanie z dokładnie taką ścieżką, jaką podajemy (fetch normalizowałby „..” po stronie klienta). */
function request(
  method: string,
  rawPath: string,
  { headers = {}, body }: { headers?: Record<string, string>; body?: Buffer | string } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const length = body === undefined ? {} : { 'content-length': String(Buffer.byteLength(body)) };
    const req = http.request(
      { host: '127.0.0.1', port, method, path: rawPath, headers: { ...length, ...headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }),
        );
      },
    );
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const auth = (key = serviceKey()) => ({ Authorization: `Bearer ${key}` });

function upload(key: string, body: Buffer | string = PNG, headers: Record<string, string> = {}) {
  return request('POST', `/storage/v1/object/logos/${key}`, {
    headers: { ...auth(), 'content-type': 'image/png', ...headers },
    body,
  });
}

/** Wszystkie pliki pod katalogiem (ścieżki względne). */
function listFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    const rel = path.join(prefix, name);
    return statSync(full).isDirectory() ? listFiles(full, rel) : [rel];
  });
}

/** Poza katalogiem zasobnika nic nie przybyło i sekret się nie zmienił. */
function expectNothingOutsideStorage() {
  const outside = listFiles(root).filter((file) => !file.startsWith(`storage${path.sep}`));
  expect(outside.sort()).toEqual(['secret.txt', path.join('templates', 'magic-link.html')].sort());
  expect(readFileSync(path.join(root, 'secret.txt'), 'utf8')).toBe(SECRET_TEXT);
}

beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'sedno-gateway-'));
  storageDir = path.join(root, 'storage');
  mkdirSync(storageDir);
  mkdirSync(path.join(root, 'templates'));
  writeFileSync(path.join(root, 'templates', 'magic-link.html'), '<p>{{ .ConfirmationURL }}</p>');
  writeFileSync(path.join(root, 'secret.txt'), SECRET_TEXT);
  // Usługi Supabase Auth i PostgREST celowo niedostępne (port 9 — discard, nikt nie słucha).
  server = createGateway({
    storageDir,
    templatesDir: path.join(root, 'templates'),
    upstream: { host: '127.0.0.1', auth: 9, rest: 9 },
    jwtSecret: SECRET,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(root, { recursive: true, force: true });
});

describe('cleanKey i objectFile', () => {
  it('przyjmuje zwykłe klucze (dekodowane raz, bez ukośnika na początku)', () => {
    expect(cleanKey('owner/logo.png')).toBe('owner/logo.png');
    expect(cleanKey('a%20b/logo.png')).toBe('a b/logo.png');
    expect(cleanKey('/owner/logo.png')).toBe('owner/logo.png');
    // Podwójnie zakodowane kropki to po jednym dekodowaniu zwykłe znaki „%2e”, nie „..”.
    expect(cleanKey('%252e%252e/logo.png')).toBe('%2e%2e/logo.png');
  });

  it('odrzuca przejścia, puste segmenty, znaki sterujące, ukośnik wsteczny i złe kodowanie', () => {
    const bad = [
      '',
      '/',
      '..',
      '../secret.txt',
      'a/../../secret.txt',
      '%2e%2e/secret.txt',
      '%2E%2E%2Fsecret.txt',
      '..%2fsecret.txt',
      'a%2f..%2f..%2fsecret.txt',
      'a/./b.png',
      'a//b.png',
      '..%5csecret.txt',
      'a\\b.png',
      'a%00.png',
      'a%0a.png',
      'a%7f.png',
      '%',
      '%zz',
      '%E0%A4%A',
      'a'.repeat(1025),
    ];
    for (const key of bad) expect(cleanKey(key), JSON.stringify(key)).toBeNull();
  });

  it('nazwy plików metadanych są zarezerwowane w każdym segmencie', () => {
    expect(cleanKey('owner/logo.png.meta.json')).toBeNull();
    expect(cleanKey('owner/x.meta.json/logo.png')).toBeNull();
    expect(cleanKey('owner.meta.json/logo.png')).toBeNull();
  });

  it('tylko znany zasobnik, także dla nazw z prototypu obiektu', () => {
    for (const bucket of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'avatars', '..', '.']) {
      expect(objectFile(storageDir, bucket, 'owner/logo.png'), bucket).toBeNull();
    }
  });

  it('plik zawsze wewnątrz katalogu zasobnika', () => {
    const bucketRoot = path.resolve(storageDir, 'logos') + path.sep;
    const inputs = [
      'owner/logo.png',
      '%252e%252e/x',
      'a b/c',
      '%2e%2e%2f%2e%2e%2fx',
      '....//x',
      '.../x',
      '..../x',
    ];
    for (const input of inputs) {
      const file = objectFile(storageDir, 'logos', input);
      if (file !== null) expect(file.startsWith(bucketRoot), input).toBe(true);
    }
  });
});

describe('verifyJwt', () => {
  it('przyjmuje tylko HS256 podpisany właściwym sekretem, z poprawnym JSON-em i ważny', () => {
    expect(verifyJwt(serviceKey(), SECRET)?.role).toBe('service_role');
    const header = b64({ alg: 'HS256', typ: 'JWT' });
    const bad = [
      serviceKey(JWT_SECRET),
      `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ role: 'service_role' })}.`,
      `${b64({ alg: 'HS512', typ: 'JWT' })}.${serviceKey().split('.').slice(1).join('.')}`,
      signJwt({ role: 'service_role', exp: now() - 10 }, SECRET),
      signJwt({ role: 'service_role', exp: 'jutro' }, SECRET),
      signJwt({ role: 'service_role', exp: Number.POSITIVE_INFINITY }, SECRET),
      `${header}.${Buffer.from('[1,2]').toString('base64url')}.x`,
      `${header}.nie-json.x`,
      'a.b',
      'a.b.c.d',
      '',
    ];
    for (const token of bad) expect(verifyJwt(token, SECRET), token.slice(0, 40)).toBeNull();
  });

  it('nie da się dopisać podpisu z innej treści', () => {
    const [header, , signature] = serviceKey().split('.') as [string, string, string];
    const forged = `${header}.${b64({ role: 'service_role', exp: now() + 99_999 })}.${signature}`;
    expect(verifyJwt(forged, SECRET)).toBeNull();
  });
});

describe('magazyn: tylko klucz serwisowy', () => {
  it('bez klucza, z kluczem anon, tokenem użytkownika, obcym sekretem, alg „none” i wygasłym: 403', async () => {
    expect((await upload('owner/logo.png')).status).toBe(200);
    const denied: Record<string, string>[] = [
      {},
      auth(signJwt({ role: 'anon', exp: now() + 3600 }, SECRET)),
      auth(signJwt({ role: 'authenticated', sub: 'u', exp: now() + 3600 }, SECRET)),
      auth(serviceKey(JWT_SECRET)),
      auth(`${b64({ alg: 'none', typ: 'JWT' })}.${b64({ role: 'service_role', exp: now() + 3600 })}.`),
      auth(signJwt({ role: 'service_role', exp: now() - 60 }, SECRET)),
      { Authorization: serviceKey() },
      { apikey: serviceKey() },
    ];
    for (const headers of denied) {
      const read = await request('GET', '/storage/v1/object/logos/owner/logo.png', { headers });
      expect(read.status).toBe(403);
      expect(read.body.includes(PNG)).toBe(false);
      const write = await request('POST', '/storage/v1/object/logos/owner/evil.png', {
        headers: { ...headers, 'content-type': 'image/png' },
        body: PNG,
      });
      expect(write.status).toBe(403);
      const remove = await request('DELETE', '/storage/v1/object/logos', {
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ prefixes: ['owner/logo.png'] }),
      });
      expect(remove.status).toBe(403);
      const sign = await request('POST', '/storage/v1/object/sign/logos/owner/logo.png', {
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ expiresIn: 60 }),
      });
      expect(sign.status).toBe(403);
    }
    expect(readdirSync(path.join(storageDir, 'logos', 'owner'))).not.toContain('evil.png');
  });

  it('zasobnik prywatny: brak publicznych i „uwierzytelnionych” adresów bez klucza', async () => {
    for (const route of ['public', 'authenticated']) {
      const res = await request('GET', `/storage/v1/object/${route}/logos/owner/logo.png`);
      expect(res.status, route).toBe(403);
    }
  });

  it('z kluczem: zapis, odczyt z typem z listy zasobnika, nosniff i bez cache', async () => {
    const res = await request('GET', '/storage/v1/object/logos/owner/logo.png', { headers: auth() });
    expect(res.status).toBe(200);
    expect(res.body.equals(PNG)).toBe(true);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('magazyn: przejście poza katalog zasobnika', () => {
  const traversal = [
    '/storage/v1/object/logos/..%2f..%2fsecret.txt',
    '/storage/v1/object/logos/%2e%2e%2f%2e%2e%2fsecret.txt',
    '/storage/v1/object/logos/%2E%2E/%2E%2E/secret.txt',
    '/storage/v1/object/logos/a%2f..%2f..%2f..%2fsecret.txt',
    '/storage/v1/object/logos/..%5c..%5csecret.txt',
    '/storage/v1/object/logos/../../secret.txt',
    '/storage/v1/object/..%2f..%2f/secret.txt',
    '/storage/v1/object/logos/%00/secret.txt',
  ];

  it('odczyt: nigdy nie zwraca pliku spoza zasobnika', async () => {
    for (const route of traversal) {
      const res = await request('GET', route, { headers: auth() });
      expect([400, 404], route).toContain(res.status);
      expect(res.body.toString('utf8')).not.toContain(SECRET_TEXT);
    }
  });

  it('zapis: nic nie powstaje ani nie zmienia się poza zasobnikiem', async () => {
    for (const route of traversal) {
      const res = await request('POST', route, {
        headers: { ...auth(), 'content-type': 'image/png', 'x-upsert': 'true' },
        body: PNG,
      });
      expect([400, 404], route).toContain(res.status);
    }
    expectNothingOutsideStorage();
  });

  it('usuwanie: klucze z „..” w JSON-ie nie trafiają w pliki poza zasobnikiem', async () => {
    const res = await request('DELETE', '/storage/v1/object/logos', {
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({
        prefixes: [
          '../secret.txt',
          '../../secret.txt',
          'a/../../../secret.txt',
          '..\\..\\secret.txt',
          '/../secret.txt',
        ],
      }),
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body.toString('utf8'))).toEqual([]);
    expectNothingOutsideStorage();
  });

  it('podpisywanie: klucz z przejściem jest odrzucany', async () => {
    const res = await request('POST', '/storage/v1/object/sign/logos/..%2f..%2fsecret.txt', {
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ expiresIn: 60 }),
    });
    expect(res.status).toBe(400);
  });

  it('szablony e-maili: tylko pliki *.html z katalogu szablonów', async () => {
    expect((await request('GET', '/templates/magic-link.html')).status).toBe(200);
    for (const route of [
      '/templates/..%2fsecret.txt',
      '/templates/../secret.txt',
      '/templates/%2e%2e/secret.txt',
    ]) {
      const res = await request('GET', route);
      expect(res.status, route).toBe(404);
      expect(res.body.toString('utf8')).not.toContain(SECRET_TEXT);
    }
  });
});

describe('magazyn: typ i rozmiar pliku', () => {
  it('SVG, HTML i brak typu: 415, nic nie zapisane', async () => {
    for (const type of [
      'image/svg+xml',
      'image/svg+xml; charset=utf-8',
      'text/html',
      'application/octet-stream',
      '',
    ]) {
      const res = await upload('owner/obraz.png', '<svg onload="alert(1)"/>', { 'content-type': type });
      expect(res.status, type).toBe(415);
    }
    expect(readdirSync(path.join(storageDir, 'logos', 'owner'))).not.toContain('obraz.png');
  });

  it('treść SVG zgłoszona jako PNG wraca jako image/png z nosniff (przeglądarka jej nie wykona)', async () => {
    expect((await upload('owner/udawany.png', '<svg onload="alert(1)"/>')).status).toBe(200);
    const res = await request('GET', '/storage/v1/object/logos/owner/udawany.png', { headers: auth() });
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('podmienione metadane na dysku nie zmienią typu odpowiedzi na HTML', async () => {
    expect((await upload('owner/meta.png')).status).toBe(200);
    writeFileSync(
      path.join(storageDir, 'logos', 'owner', 'meta.png.meta.json'),
      '{"contentType":"text/html"}',
    );
    const res = await request('GET', '/storage/v1/object/logos/owner/meta.png', { headers: auth() });
    expect(res.headers['content-type']).toBe('application/octet-stream');
  });

  it('pliki metadanych nie są do odczytu ani zapisu przez API', async () => {
    expect((await upload('owner/logo.png.meta.json', PNG, { 'x-upsert': 'true' })).status).toBe(400);
    expect((await upload('owner/x.meta.json/logo.png')).status).toBe(400);
    const read = await request('GET', '/storage/v1/object/logos/owner/logo.png.meta.json', {
      headers: auth(),
    });
    expect(read.status).toBe(400);
  });

  it('limit 2 MB: większy plik 413 i bez zapisu, dokładnie 2 MB przechodzi', async () => {
    const tooBig = Buffer.alloc(MAX + 1);
    PNG.copy(tooBig);
    expect((await upload('owner/duzy.png', tooBig)).status).toBe(413);
    expect(readdirSync(path.join(storageDir, 'logos', 'owner'))).not.toContain('duzy.png');
    const exact = Buffer.alloc(MAX);
    PNG.copy(exact);
    expect((await upload('owner/limit.png', exact)).status).toBe(200);
  });

  it('istniejący plik bez upsert: 409; nieznany zasobnik: 404', async () => {
    expect((await upload('owner/logo.png')).status).toBe(409);
    const unknown = await request('POST', '/storage/v1/object/avatars/owner/logo.png', {
      headers: { ...auth(), 'content-type': 'image/png' },
      body: PNG,
    });
    expect(unknown.status).toBe(404);
  });
});

describe('magazyn: podpisane adresy', () => {
  async function signedUrl(key: string, expiresIn: unknown = 60): Promise<Reply & { url?: string }> {
    const res = await request('POST', `/storage/v1/object/sign/logos/${key}`, {
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ expiresIn }),
    });
    const parsed =
      res.status === 200 ? (JSON.parse(res.body.toString('utf8')) as { signedURL: string }) : null;
    return { ...res, url: parsed ? `/storage/v1${parsed.signedURL}` : undefined };
  }

  it('poprawny adres działa bez klucza', async () => {
    const { url } = await signedUrl('owner/logo.png');
    const res = await request('GET', url!);
    expect(res.status).toBe(200);
    expect(res.body.equals(PNG)).toBe(true);
  });

  it('zmieniony podpis, treść, klucz albo sekret: 400', async () => {
    const { url } = await signedUrl('owner/logo.png');
    const token = new URL(url!, 'http://x').searchParams.get('token')!;
    const [header, body, signature] = token.split('.') as [string, string, string];
    const flipped = `${signature.slice(0, -2)}${signature.endsWith('AA') ? 'BB' : 'AA'}`;
    const otherBody = b64({ url: 'logos/owner/limit.png', exp: now() + 60 });
    const variants = [
      `/storage/v1/object/sign/logos/owner/logo.png?token=${header}.${body}.${flipped}`,
      `/storage/v1/object/sign/logos/owner/limit.png?token=${header}.${otherBody}.${signature}`,
      `/storage/v1/object/sign/logos/owner/limit.png?token=${token}`,
      `/storage/v1/object/sign/logos/owner/logo.png?token=${signJwt({ url: 'logos/owner/logo.png', exp: now() + 60 }, JWT_SECRET)}`,
      `/storage/v1/object/sign/logos/owner/logo.png?token=${signJwt({ url: 'logos/owner/logo.png' }, SECRET)}`,
      `/storage/v1/object/sign/logos/owner/logo.png?token=${signJwt({ url: 'logos/owner/logo.png', exp: now() - 5 }, SECRET)}`,
      `/storage/v1/object/sign/logos/owner/logo.png?token=${serviceKey()}`,
      '/storage/v1/object/sign/logos/owner/logo.png',
    ];
    for (const route of variants) {
      const res = await request('GET', route);
      expect(res.status, route.slice(0, 80)).toBe(400);
      expect(res.body.includes(PNG)).toBe(false);
    }
  });

  it('czas ważności: tylko dodatnia liczba całkowita sekund, najwyżej rok', async () => {
    for (const expiresIn of [0, -1, 1.5, '60', null, 366 * 24 * 3600, Number.MAX_SAFE_INTEGER]) {
      expect((await signedUrl('owner/logo.png', expiresIn)).status, String(expiresIn)).toBe(400);
    }
  });
});

describe('odporność bramki', () => {
  it('zły JSON, zła metoda i niedostępna usługa nie wyłączają bramki', async () => {
    const badJson = await request('DELETE', '/storage/v1/object/logos', {
      headers: { ...auth(), 'content-type': 'application/json' },
      body: '{"prefixes": [',
    });
    expect(badJson.status).toBe(400);
    const tooMany = await request('DELETE', '/storage/v1/object/logos', {
      headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ prefixes: Array.from({ length: 1001 }, (_, i) => `k${i}`) }),
    });
    expect(tooMany.status).toBe(400);
    expect(
      (await request('PATCH', '/storage/v1/object/logos/owner/logo.png', { headers: auth() })).status,
    ).toBe(405);
    expect((await request('GET', '/rest/v1/clients')).status).toBe(502);
    expect((await request('GET', '/health')).status).toBe(200);
  });
});

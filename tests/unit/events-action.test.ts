/**
 * Server Action recordEvent (PROMPT.md §16): ścisłe schematy, limit, nic nie zapisujemy przy błędzie.
 * Obietnica prywatności: zdarzenie nie może nieść treści pliku (znacznik SEDNO-PRIVACY-CANARY-7f3a).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventName } from '@/lib/analytics/events';
import type { EventRow, Store } from '@/lib/server/store';

const CANARY = 'SEDNO-PRIVACY-CANARY-7f3a';
const ANON = 'AbCdEfGhIjKlMnOpQrStUv';

const h = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  headersThrow: false,
  /** Ile razy akcja odczytała nagłówki — to jej pierwszy krok, więc 0 znaczy „nic nie wysłano”. */
  calls: 0,
}));

vi.mock('next/headers', () => ({
  headers: async () => {
    h.calls += 1;
    if (h.headersThrow) throw new Error('poza żądaniem');
    return new Headers(Object.fromEntries(h.headers));
  },
}));

const storeMock = vi.hoisted(() => ({ getStore: vi.fn() }));
vi.mock('@/lib/server/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/store')>()),
  getStore: storeMock.getStore,
}));

const { recordEvent } = await import('@/app/actions/events');
const { resetRateLimits } = await import('@/lib/server/rate-limit');

class MemoryStore implements Store {
  events: EventRow[] = [];
  failEvents = false;
  async insertEvent(row: EventRow) {
    if (this.failEvents) throw new Error(`awaria bazy ${JSON.stringify(row)}`);
    this.events.push(row);
  }
  async insertWaitlist() {
    return 'created' as const;
  }
}

let store: MemoryStore;
const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  resetRateLimits();
  h.headers = new Map([['x-forwarded-for', '203.0.113.7']]);
  h.headersThrow = false;
  h.calls = 0;
  store = new MemoryStore();
  storeMock.getStore.mockReset();
  storeMock.getStore.mockImplementation(() => store);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const VALID: { [N in EventName]: Record<string, unknown> } = {
  landing_cta_click: { cta: 'hero' },
  csv_parsed: { rows: 31, months: 2, ms: 120 },
  csv_error: { code: 'E_EMPTY' },
  report_previewed: { mode: 'anon' },
  pdf_downloaded: { mode: 'anon', branding: 'sedno-footer' },
  signup_completed: {},
  link_created: {},
  link_opened: {},
  checkout_started: { product: 'solo' },
  purchase_completed: { product: 'single' },
  waitlist_joined: { plan: 'studio' },
};
const NAMES = Object.keys(VALID) as EventName[];
/** Zapisuje je wyłącznie serwer (joinWaitlist, auth, webhook Stripe) — przeglądarka nie może ich podrobić. */
const SERVER_ONLY: EventName[] = ['waitlist_joined', 'signup_completed', 'purchase_completed'];
const CLIENT_NAMES = NAMES.filter((name) => !SERVER_ONLY.includes(name));

describe('recordEvent — prawidłowe zdarzenia', () => {
  it.each(CLIENT_NAMES)('%s z prawidłowymi właściwościami jest zapisane (owner_id null)', async (name) => {
    expect(await recordEvent({ name, anonId: ANON, props: VALID[name] })).toEqual({ ok: true });
    expect(store.events).toEqual([{ name, anonId: ANON, ownerId: null, props: VALID[name] }]);
  });

  it.each(SERVER_ONLY)(
    '%s jest zdarzeniem serwera: z przeglądarki odrzucone, nic nie zapisane',
    async (name) => {
      expect(await recordEvent({ name, anonId: ANON, props: VALID[name] })).toEqual({ ok: false });
      expect(store.events).toEqual([]);
    },
  );

  it('zapisuje do FileStore przez getStore (SEDNO_DEV_STORE_DIR)', async () => {
    const actual = await vi.importActual<typeof import('@/lib/server/store')>('@/lib/server/store');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sedno-events-'));
    tempDirs.push(dir);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('SEDNO_DEV_STORE_DIR', dir);
    storeMock.getStore.mockImplementation(() => actual.getStore());

    expect(await recordEvent({ name: 'csv_parsed', anonId: ANON, props: VALID.csv_parsed })).toEqual({
      ok: true,
    });
    const line = JSON.parse(fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(line).toMatchObject({
      name: 'csv_parsed',
      anon_id: ANON,
      owner_id: null,
      props: VALID.csv_parsed,
    });
  });
});

describe('recordEvent — odrzucenia (nic nie trafia do magazynu)', () => {
  it('dodatkowe właściwości są odrzucane', async () => {
    for (const name of NAMES) {
      expect(await recordEvent({ name, anonId: ANON, props: { ...VALID[name], extra: 1 } })).toEqual({
        ok: false,
      });
    }
    expect(store.events).toEqual([]);
  });

  it('znacznik prywatności w dowolnym tekście właściwości jest odrzucany', async () => {
    const attempts: { name: string; props: Record<string, unknown> }[] = [];
    for (const name of NAMES) {
      const valid = VALID[name];
      // Znacznik zamiast każdej istniejącej wartości…
      for (const key of Object.keys(valid)) attempts.push({ name, props: { ...valid, [key]: CANARY } });
      // …i jako dodatkowe pole: tekst, tablica, zagnieżdżony obiekt, klucz.
      attempts.push({ name, props: { ...valid, caption: CANARY } });
      attempts.push({ name, props: { ...valid, rows: [CANARY] } });
      attempts.push({ name, props: { ...valid, nested: { text: `Opis posta ${CANARY}` } } });
      attempts.push({ name, props: { ...valid, [CANARY]: 1 } });
    }
    // Znacznik w nazwie zdarzenia i w polach poza właściwościami.
    attempts.push({ name: CANARY, props: {} });

    for (const attempt of attempts) {
      expect(await recordEvent({ ...attempt, anonId: ANON })).toEqual({ ok: false });
    }
    expect(await recordEvent({ name: 'link_opened', anonId: ANON, props: {}, caption: CANARY })).toEqual({
      ok: false,
    });
    // Identyfikator sesji ma dokładnie 22 znaki — znacznik (25 znaków) nie zmieści się także tam.
    for (const anonId of [CANARY, `${CANARY} ${CANARY}`, CANARY.slice(0, 16)]) {
      expect(await recordEvent({ name: 'link_opened', anonId, props: {} })).toEqual({ ok: false });
    }
    expect(store.events).toEqual([]);
    expect(JSON.stringify(store.events)).not.toContain(CANARY);
  });

  it('nieznana nazwa zdarzenia jest odrzucana', async () => {
    expect(await recordEvent({ name: 'file_uploaded', anonId: ANON, props: {} })).toEqual({ ok: false });
    expect(await recordEvent({ name: '__proto__', anonId: ANON, props: {} })).toEqual({ ok: false });
    expect(store.events).toEqual([]);
  });

  it('wartości spoza zakresu i złe typy są odrzucane', async () => {
    const bad: [EventName, Record<string, unknown>][] = [
      ['csv_parsed', { rows: -1, months: 1, ms: 1 }],
      ['csv_parsed', { rows: 1.5, months: 1, ms: 1 }],
      ['csv_parsed', { rows: '31', months: 1, ms: 1 }],
      ['csv_parsed', { rows: 1, months: 1 }],
      ['report_previewed', { mode: 'ANON' }],
      ['signup_completed', { mode: 'anon' }],
    ];
    for (const [name, props] of bad) {
      expect(await recordEvent({ name, anonId: ANON, props })).toEqual({ ok: false });
    }
    expect(store.events).toEqual([]);
  });

  it('brak albo zły identyfikator sesji jest odrzucany', async () => {
    const wrong = [
      undefined,
      '',
      'krótki',
      'a'.repeat(16),
      'a'.repeat(23),
      'a'.repeat(33),
      'zły identyfikator!',
      42,
    ];
    for (const anonId of wrong) {
      expect(await recordEvent({ name: 'link_opened', anonId, props: {} })).toEqual({ ok: false });
    }
    expect(store.events).toEqual([]);
  });

  it('wejście niebędące obiektem jest odrzucane', async () => {
    for (const input of [undefined, null, 'csv_parsed', 42, [], new Date()]) {
      expect(await recordEvent(input)).toEqual({ ok: false });
    }
    expect(store.events).toEqual([]);
  });
});

describe('recordEvent — limit zapytań', () => {
  it('120 na minutę z jednego adresu IP', async () => {
    const results = [];
    for (let i = 0; i < 121; i++) {
      // Różne identyfikatory sesji: działa limit na IP.
      const anonId = `sesja${String(i).padStart(17, '0')}`;
      results.push((await recordEvent({ name: 'link_opened', anonId, props: {} })).ok);
    }
    expect(results.filter(Boolean)).toHaveLength(120);
    expect(results.at(-1)).toBe(false);
    expect(store.events).toHaveLength(120);

    // Inny adres ma własny limit.
    h.headers = new Map([['x-forwarded-for', '198.51.100.1, 10.0.0.1']]);
    expect(await recordEvent({ name: 'link_opened', anonId: ANON, props: {} })).toEqual({ ok: true });
  });

  it('120 na minutę na identyfikator sesji, także z różnych adresów', async () => {
    const results = [];
    for (let i = 0; i < 121; i++) {
      h.headers = new Map([['x-real-ip', `192.0.2.${i}`]]);
      results.push((await recordEvent({ name: 'link_opened', anonId: ANON, props: {} })).ok);
    }
    expect(results.filter(Boolean)).toHaveLength(120);
    expect(results.at(-1)).toBe(false);
  });

  it('nieprawidłowe próby też zużywają limit adresu IP', async () => {
    for (let i = 0; i < 120; i++) await recordEvent({ name: 'nieznane', anonId: ANON, props: {} });
    expect(await recordEvent({ name: 'link_opened', anonId: ANON, props: {} })).toEqual({ ok: false });
    expect(store.events).toEqual([]);
  });
});

describe('recordEvent — nigdy nie rzuca', () => {
  it('awaria magazynu → { ok: false }, a log nie zawiera właściwości ani identyfikatora', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    store.failEvents = true;
    expect(await recordEvent({ name: 'csv_parsed', anonId: ANON, props: VALID.csv_parsed })).toEqual({
      ok: false,
    });
    const logged = log.mock.calls.flat().map(String).join(' ');
    expect(logged).not.toContain(ANON);
    expect(logged).not.toContain('rows');
  });

  it('brak magazynu → { ok: false }', async () => {
    storeMock.getStore.mockImplementation(() => null);
    expect(await recordEvent({ name: 'link_opened', anonId: ANON, props: {} })).toEqual({ ok: false });
  });

  it('wyjątek przy odczycie wejścia → { ok: false }', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const hostile = {
      get name(): string {
        throw new Error('pułapka');
      },
    };
    await expect(recordEvent(hostile)).resolves.toEqual({ ok: false });
  });

  it('brak nagłówków żądania → wspólny klucz „unknown”, zapis działa', async () => {
    h.headersThrow = true;
    expect(await recordEvent({ name: 'link_opened', anonId: ANON, props: {} })).toEqual({ ok: true });
  });
});

describe('lib/analytics/client — track() i identyfikator sesji (przeglądarka)', () => {
  function fakeSessionStorage(initial: Record<string, string> = {}, broken = false) {
    const data = new Map(Object.entries(initial));
    const fail = () => {
      throw new Error('SecurityError');
    };
    return {
      data,
      getItem: (k: string) => (broken ? fail() : (data.get(k) ?? null)),
      setItem: (k: string, v: string) => (broken ? fail() : void data.set(k, v)),
    };
  }

  async function loadClient(storage: ReturnType<typeof fakeSessionStorage>) {
    vi.stubGlobal('window', { sessionStorage: storage });
    return import('@/lib/analytics/client');
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getAnonId: 22 znaki base64url w sessionStorage „sedno.anonId”, stały w sesji', async () => {
    const storage = fakeSessionStorage();
    const { getAnonId, ANON_ID_KEY } = await loadClient(storage);
    const id = getAnonId();
    expect(ANON_ID_KEY).toBe('sedno.anonId');
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(storage.data.get('sedno.anonId')).toBe(id);
    expect(getAnonId()).toBe(id);
  });

  it('getAnonId: używa zapisanego identyfikatora; uszkodzony zastępuje nowym', async () => {
    const { getAnonId } = await loadClient(fakeSessionStorage({ 'sedno.anonId': ANON }));
    expect(getAnonId()).toBe(ANON);

    const broken = fakeSessionStorage({ 'sedno.anonId': 'zły <script>' });
    vi.stubGlobal('window', { sessionStorage: broken });
    const fresh = getAnonId();
    expect(fresh).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(broken.data.get('sedno.anonId')).toBe(fresh);
  });

  it('getAnonId: gdy sessionStorage nie działa, identyfikator żyje w pamięci (stały)', async () => {
    const { getAnonId } = await loadClient(fakeSessionStorage({}, true));
    const id = getAnonId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(getAnonId()).toBe(id);
  });

  it('track: prawidłowe zdarzenie trafia przez Server Action do magazynu; nie zwraca obietnicy', async () => {
    const { track, getAnonId } = await loadClient(fakeSessionStorage());
    const result: unknown = track('csv_parsed', { rows: 31, months: 2, ms: 120 });
    expect(result).toBeUndefined();
    await vi.waitFor(() => expect(store.events).toHaveLength(1));
    expect(store.events[0]).toEqual({
      name: 'csv_parsed',
      anonId: getAnonId(),
      ownerId: null,
      props: { rows: 31, months: 2, ms: 120 },
    });
  });

  it('track: znacznik prywatności i dodatkowe pola odpadają w przeglądarce, przed wysyłką', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('NODE_ENV', 'production');
    const { track } = await loadClient(fakeSessionStorage());
    // Wywołania z obejściem typów — tak mogłby wyglądać błąd w kodzie aplikacji.
    const unsafeTrack = track as (name: string, props: Record<string, unknown>) => void;
    unsafeTrack('csv_error', { code: CANARY });
    unsafeTrack('csv_parsed', { rows: 31, months: 2, ms: 120, caption: CANARY });
    unsafeTrack(CANARY, {});
    unsafeTrack('__proto__', {});
    await new Promise((r) => setTimeout(r, 20));
    expect(store.events).toEqual([]);
    // Akcja serwera w ogóle nie została wywołana: odrzucenie nastąpiło w przeglądarce.
    expect(h.calls).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('track: w trybie deweloperskim ostrzeżenie bez treści właściwości', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('NODE_ENV', 'development');
    const { track } = await loadClient(fakeSessionStorage());
    (track as (name: string, props: Record<string, unknown>) => void)('csv_error', { code: CANARY });
    await vi.waitFor(() => expect(warn).toHaveBeenCalledOnce());
    expect(warn.mock.calls.flat().map(String).join(' ')).not.toContain(CANARY);
    expect(store.events).toEqual([]);
  });

  it('track: zdarzeń serwera nie da się wywołać (typ), a gdyby dotarły — serwer je odrzuca', async () => {
    const { track } = await loadClient(fakeSessionStorage());
    // @ts-expect-error waitlist_joined zapisuje wyłącznie joinWaitlist na serwerze.
    track('waitlist_joined', { plan: 'solo' });
    // @ts-expect-error purchase_completed zapisuje wyłącznie webhook płatności.
    track('purchase_completed', { product: 'solo' });
    await new Promise((r) => setTimeout(r, 20));
    expect(store.events).toEqual([]);
  });

  it('getAnonId i track nie ładują zod razem z modułem (JavaScript strony głównej)', () => {
    // Schematy (zod) tylko przez dynamiczny import w track(); statycznie wyłącznie typy.
    const source = fs.readFileSync(path.join(process.cwd(), 'lib/analytics/client.ts'), 'utf8');
    const staticImports = [...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)'/gm)].map(
      (m) => m[1],
    );
    expect(staticImports).toEqual(['@/app/actions/events']);
    expect(source).toMatch(/import\('\.\/events'\)/);
  });

  it('track: nigdy nie rzuca (awaria magazynu, brak sessionStorage, brak window)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    store.failEvents = true;
    const { track } = await loadClient(fakeSessionStorage({}, true));
    expect(() => track('link_opened', {})).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    expect(store.events).toEqual([]);

    vi.unstubAllGlobals();
    store.failEvents = false;
    expect(() => track('link_opened', {})).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    // Bez window (serwer) nic nie jest wysyłane.
    expect(store.events).toEqual([]);
  });
});

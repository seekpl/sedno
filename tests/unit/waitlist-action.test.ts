/**
 * Server Action joinWaitlist (docs/decisions.md, p. 18): walidacja zod, zgoda, limit, duplikaty bez
 * zdradzania członkostwa, uczciwy błąd bez magazynu, zdarzenie waitlist_joined.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitlist as t } from '@/lib/copy/waitlist';
import type { EventRow, Store, WaitlistRow } from '@/lib/server/store';

const ANON = 'AbCdEfGhIjKlMnOpQrStUv';

const h = vi.hoisted(() => ({ headers: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(Object.fromEntries(h.headers)),
}));

const storeMock = vi.hoisted(() => ({ getStore: vi.fn() }));
vi.mock('@/lib/server/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/store')>()),
  getStore: storeMock.getStore,
}));

const { joinWaitlist } = await import('@/app/actions/waitlist');
type WaitlistState = Awaited<ReturnType<typeof joinWaitlist>>;
const { resetRateLimits } = await import('@/lib/server/rate-limit');

class MemoryStore implements Store {
  waitlist: WaitlistRow[] = [];
  events: EventRow[] = [];
  failWaitlist = false;
  failEvents = false;
  async insertEvent(row: EventRow) {
    if (this.failEvents) throw new Error('awaria zdarzeń');
    this.events.push(row);
  }
  async insertWaitlist(row: WaitlistRow) {
    if (this.failWaitlist) throw new Error(`awaria bazy dla ${row.email}`);
    if (this.waitlist.some((r) => r.email === row.email && r.plan === row.plan)) return 'exists' as const;
    this.waitlist.push(row);
    return 'created' as const;
  }
}

let store: MemoryStore;
const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});
const IDLE: WaitlistState = { status: 'idle' };

function form(fields: Record<string, string | Blob | undefined>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) data.append(key, value);
  return data;
}

const valid = (extra: Record<string, string | undefined> = {}) =>
  form({ email: 'ala@firma.pl', plan: 'solo', consent: 'on', anonId: ANON, ...extra });

beforeEach(() => {
  resetRateLimits();
  h.headers = new Map([['x-forwarded-for', '203.0.113.7']]);
  store = new MemoryStore();
  storeMock.getStore.mockReset();
  storeMock.getStore.mockImplementation(() => store);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('joinWaitlist — walidacja', () => {
  it('pusty adres → „Wpisz adres e-mail.” przy polu', async () => {
    const state = await joinWaitlist(IDLE, valid({ email: '   ' }));
    expect(state.status).toBe('error');
    expect(state.fieldErrors).toEqual({ email: t.errors.emailRequired });
    expect(store.waitlist).toEqual([]);
  });

  it('brak pola e-mail albo plik zamiast tekstu → ten sam komunikat', async () => {
    expect((await joinWaitlist(IDLE, valid({ email: undefined }))).fieldErrors?.email).toBe(
      t.errors.emailRequired,
    );
    const withFile = form({ email: new Blob(['x']), plan: 'solo', consent: 'on' });
    expect((await joinWaitlist(IDLE, withFile)).fieldErrors?.email).toBe(t.errors.emailRequired);
  });

  it.each(['ala', 'ala@', '@firma.pl', 'ala@firma', 'ala firma@firma.pl', 'ala@@firma.pl'])(
    'niepełny adres „%s” → komunikat o @ i domenie',
    async (email) => {
      const state = await joinWaitlist(IDLE, valid({ email }));
      expect(state.fieldErrors).toEqual({ email: t.errors.emailInvalid });
      expect(store.waitlist).toEqual([]);
    },
  );

  it('adres dłuższy niż 254 znaki → osobny komunikat', async () => {
    const email = `${'a'.repeat(250)}@firma.pl`;
    const state = await joinWaitlist(IDLE, valid({ email }));
    expect(state.fieldErrors).toEqual({ email: t.errors.emailTooLong });
  });

  it('zgoda jest wymagana (brak albo inna wartość niż „on”)', async () => {
    for (const consent of [undefined, '', 'off', 'true']) {
      const state = await joinWaitlist(IDLE, valid({ consent }));
      expect(state.status).toBe('error');
      expect(state.fieldErrors).toEqual({ consent: t.errors.consentRequired });
    }
    expect(store.waitlist).toEqual([]);
  });

  it('oba błędy naraz; stan oddaje wpisany adres i stan zgody', async () => {
    const state = await joinWaitlist(IDLE, valid({ email: ' ala@ ', consent: undefined }));
    expect(state).toEqual({
      status: 'error',
      fieldErrors: { email: t.errors.emailInvalid, consent: t.errors.consentRequired },
      email: 'ala@',
      consent: false,
    });
  });

  it('po błędzie adresu zgoda pozostaje zaznaczona', async () => {
    const state = await joinWaitlist(IDLE, valid({ email: 'ala@firma' }));
    expect(state.consent).toBe(true);
  });

  it('nieprawidłowy plan → komunikat ogólny, bez zapisu', async () => {
    for (const plan of [undefined, 'free', 'SOLO']) {
      const state = await joinWaitlist(IDLE, valid({ plan }));
      expect(state).toMatchObject({ status: 'error', message: t.errors.invalidPlan });
      expect(state.fieldErrors).toBeUndefined();
    }
    expect(store.waitlist).toEqual([]);
  });

  it('adres jest przycinany i zapisywany małymi literami', async () => {
    const state = await joinWaitlist(IDLE, valid({ email: '  Ala.Nowak@Firma.PL ' }));
    expect(state).toEqual({ status: 'success' });
    expect(store.waitlist).toHaveLength(1);
    expect(store.waitlist[0]).toMatchObject({ email: 'ala.nowak@firma.pl', plan: 'solo' });
    expect(store.waitlist[0]?.consentAt).toBeInstanceOf(Date);
  });
});

describe('joinWaitlist — zapis', () => {
  it('duplikat (e-mail, plan) → ten sam sukces, bez drugiego wiersza i drugiego zdarzenia', async () => {
    const first = await joinWaitlist(IDLE, valid());
    const second = await joinWaitlist(IDLE, valid({ email: 'ALA@firma.pl' }));
    expect(first).toEqual({ status: 'success' });
    expect(second).toEqual(first);
    expect(store.waitlist).toHaveLength(1);
    expect(store.events).toHaveLength(1);
  });

  it('ten sam adres na inny plan to nowy wpis', async () => {
    await joinWaitlist(IDLE, valid());
    await joinWaitlist(IDLE, valid({ plan: 'studio' }));
    expect(store.waitlist.map((r) => r.plan)).toEqual(['solo', 'studio']);
  });

  it('zapisuje zdarzenie waitlist_joined { plan } bez identyfikatora sesji (nie łączymy e-maila z sesją)', async () => {
    await joinWaitlist(IDLE, valid({ plan: 'studio' }));
    expect(store.events).toEqual([
      { name: 'waitlist_joined', anonId: null, ownerId: null, props: { plan: 'studio' } },
    ]);
    // Zdarzenie nie zawiera adresu e-mail.
    expect(JSON.stringify(store.events)).not.toContain('@');
  });

  it('bez albo ze złym identyfikatorem sesji: zapis działa, zdarzenie ma anonId null', async () => {
    await joinWaitlist(IDLE, valid({ anonId: undefined }));
    await joinWaitlist(IDLE, valid({ email: 'ola@firma.pl', anonId: 'SEDNO-PRIVACY-CANARY-7f3a' }));
    expect(store.waitlist).toHaveLength(2);
    expect(store.events.map((e) => e.anonId)).toEqual([null, null]);
  });

  it('awaria zapisu zdarzenia nie psuje zapisu na listę', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    store.failEvents = true;
    expect(await joinWaitlist(IDLE, valid())).toEqual({ status: 'success' });
    expect(store.waitlist).toHaveLength(1);
  });

  it('awaria bazy → błąd z przyczyną i naprawą; log bez adresu e-mail', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    store.failWaitlist = true;
    const state = await joinWaitlist(IDLE, valid({ email: 'tajny@firma.pl' }));
    expect(state).toEqual({
      status: 'error',
      message: t.errors.failed,
      email: 'tajny@firma.pl',
      consent: true,
    });
    expect(log).toHaveBeenCalled();
    expect(log.mock.calls.flat().map(String).join(' ')).not.toContain('tajny');
  });

  it('brak magazynu → uczciwy błąd, nigdy udawany sukces', async () => {
    storeMock.getStore.mockImplementation(() => null);
    const state = await joinWaitlist(IDLE, valid());
    expect(state).toMatchObject({ status: 'error', message: t.errors.unavailable });
  });

  it('błędna konfiguracja magazynu (getStore rzuca) → ten sam uczciwy błąd, akcja nie rzuca', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    storeMock.getStore.mockImplementation(() => {
      throw new Error('Invalid supabaseUrl: klucz-tajny');
    });
    const state = await joinWaitlist(IDLE, valid({ email: 'tajny@firma.pl' }));
    expect(state).toMatchObject({ status: 'error', message: t.errors.unavailable });
    const logged = log.mock.calls.flat().map(String).join(' ');
    expect(logged).not.toContain('tajny');
  });

  it('prawdziwy getStore z nieprawidłowym adresem Supabase → uczciwy błąd zamiast wyjątku', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const actual = await vi.importActual<typeof import('@/lib/server/store')>('@/lib/server/store');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'to-nie-jest-adres');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'klucz');
    storeMock.getStore.mockImplementation(() => actual.getStore());
    await expect(joinWaitlist(IDLE, valid())).resolves.toMatchObject({
      status: 'error',
      message: t.errors.unavailable,
    });
  });

  it('wejście, które nie jest formularzem (wywołanie akcji spoza strony) → błąd, bez wyjątku', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const input of [null, undefined, 'email=ala@firma.pl', { email: 'tajny@firma.pl' }]) {
      await expect(joinWaitlist(IDLE, input as unknown as FormData)).resolves.toEqual({
        status: 'error',
        message: t.errors.failed,
      });
    }
    expect(log.mock.calls.flat().map(String).join(' ')).not.toContain('tajny');
    expect(store.waitlist).toEqual([]);
  });

  it('zapis do FileStore przez getStore (SEDNO_DEV_STORE_DIR)', async () => {
    const actual = await vi.importActual<typeof import('@/lib/server/store')>('@/lib/server/store');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sedno-waitlist-'));
    tempDirs.push(dir);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('SEDNO_DEV_STORE_DIR', dir);
    storeMock.getStore.mockImplementation(() => actual.getStore());

    expect(await joinWaitlist(IDLE, valid())).toEqual({ status: 'success' });
    expect(await joinWaitlist(IDLE, valid())).toEqual({ status: 'success' });
    const lines = fs.readFileSync(path.join(dir, 'waitlist.jsonl'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const events = fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8').trim().split('\n');
    expect(events.map((l) => JSON.parse(l) as unknown)).toMatchObject([
      { name: 'waitlist_joined', anon_id: null, owner_id: null, props: { plan: 'solo' } },
    ]);
  });
});

describe('joinWaitlist — limit zapytań', () => {
  it('5 zapisów na 10 minut z jednego adresu IP; inny adres ma własny limit', async () => {
    const states = [];
    for (let i = 0; i < 6; i++) states.push(await joinWaitlist(IDLE, valid({ email: `osoba${i}@firma.pl` })));
    expect(states.slice(0, 5).every((s) => s.status === 'success')).toBe(true);
    expect(states[5]).toMatchObject({ status: 'error', message: t.errors.rateLimited });
    expect(store.waitlist).toHaveLength(5);

    h.headers = new Map([['x-real-ip', '198.51.100.9']]);
    expect(await joinWaitlist(IDLE, valid({ email: 'inna@firma.pl' }))).toEqual({ status: 'success' });
  });

  it('IPv6: zmiana adresu w obrębie sieci /64 nie omija limitu', async () => {
    const states = [];
    for (let i = 0; i < 6; i++) {
      h.headers = new Map([['x-forwarded-for', `2001:db8:aa:bb::${(i + 1).toString(16)}`]]);
      states.push(await joinWaitlist(IDLE, valid({ email: `osoba${i}@firma.pl` })));
    }
    expect(states.slice(0, 5).every((s) => s.status === 'success')).toBe(true);
    expect(states[5]).toMatchObject({ status: 'error', message: t.errors.rateLimited });

    // Inna sieć /64 ma własny limit.
    h.headers = new Map([['x-forwarded-for', '2001:db8:aa:cc::1']]);
    expect(await joinWaitlist(IDLE, valid({ email: 'inna@firma.pl' }))).toEqual({ status: 'success' });
  });

  it('port w adresie nie omija limitu', async () => {
    const states = [];
    for (let i = 0; i < 6; i++) {
      h.headers = new Map([['x-forwarded-for', `203.0.113.7:${50_000 + i}`]]);
      states.push(await joinWaitlist(IDLE, valid({ email: `osoba${i}@firma.pl` })));
    }
    expect(states[5]).toMatchObject({ status: 'error', message: t.errors.rateLimited });
  });

  it('błędy walidacji nie zużywają limitu', async () => {
    for (let i = 0; i < 10; i++) await joinWaitlist(IDLE, valid({ email: 'zły adres' }));
    expect(await joinWaitlist(IDLE, valid())).toEqual({ status: 'success' });
  });

  it('limit po 10 minutach się odnawia', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T10:00:00Z') });
    try {
      for (let i = 0; i < 5; i++) await joinWaitlist(IDLE, valid({ email: `osoba${i}@firma.pl` }));
      expect((await joinWaitlist(IDLE, valid({ email: 'x@firma.pl' }))).status).toBe('error');
      vi.setSystemTime(new Date('2026-10-12T10:10:01Z'));
      expect(await joinWaitlist(IDLE, valid({ email: 'x@firma.pl' }))).toEqual({ status: 'success' });
    } finally {
      vi.useRealTimers();
    }
  });
});

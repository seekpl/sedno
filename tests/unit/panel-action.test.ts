/**
 * Server Action „Dodaj klienta” (app/app/klienci/actions.ts): sesja, flaga kont, zod na wejściu
 * (nazwa 1–80 znaków po oczyszczeniu, branża z listy), limit, revalidatePath, błędy bez treści bazy.
 * Baza i sesja są podmienione; zapis do prawdziwej bazy sprawdza tests/db/panel-overview.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { panel as t } from '@/lib/copy/panel';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  features: { accounts: true },
  getCurrentUser: vi.fn(),
  revalidatePath: vi.fn(),
  insert: vi.fn(),
  db: { marker: 'db' },
}));

vi.mock('@/config/features', () => ({ features: mocks.features }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => mocks.db }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/data/panel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/panel')>()),
  createClient: mocks.insert,
}));

const { createClient } = await import('@/app/app/klienci/actions');
const { PanelDataError } = await import('@/lib/data/panel');
const { resetRateLimits } = await import('@/lib/server/rate-limit');

const USER = { id: '11111111-1111-4111-8111-111111111111' };
const IDLE = { status: 'idle' } as const;

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  mocks.features.accounts = true;
  mocks.getCurrentUser.mockReset().mockResolvedValue(USER);
  mocks.revalidatePath.mockReset();
  mocks.insert.mockReset().mockImplementation(async (_db, input: { name: string }) => ({
    id: '22222222-2222-4222-8222-222222222222',
    name: input.name,
  }));
  resetRateLimits();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Dodaj klienta — akcja', () => {
  it('zapisuje oczyszczoną nazwę i branżę, odświeża panel', async () => {
    const result = await createClient(IDLE, form({ name: '  Studio   Lumi ', industry: 'salon' }));
    expect(result).toEqual({
      status: 'success',
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Studio Lumi',
    });
    expect(mocks.insert).toHaveBeenCalledWith(mocks.db, { name: 'Studio Lumi', industry: 'salon' });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/app/klienci');
  });

  it('bez branży — „inne”; pola spoza formularza są pomijane', async () => {
    await createClient(
      IDLE,
      form({ name: 'Kadr', included_in_free: 'true', owner_id: 'cudzy', archived_at: '2026-01-01' }),
    );
    expect(mocks.insert).toHaveBeenCalledWith(mocks.db, { name: 'Kadr', industry: 'inne' });
  });

  it('emoji usuwa z nazwy (raport i PDF ich nie pokażą)', async () => {
    await createClient(IDLE, form({ name: 'Studio 💇 Lumi ✨', industry: 'salon' }));
    expect(mocks.insert).toHaveBeenCalledWith(mocks.db, { name: 'Studio Lumi', industry: 'salon' });
  });

  it('usuwa niewidoczne znaki formatujące i sterujące, składa do NFC', async () => {
    // Zero-width space, odwrócenie kierunku tekstu (RLO/PDF), miękki dywiz, BOM, tabulator, „e” + akcent.
    await createClient(IDLE, form({ name: '\u200bKa\u202edr\u202c\u00ad\ufeff\tCafe\u0301' }));
    expect(mocks.insert).toHaveBeenCalledWith(mocks.db, { name: 'Kadr Café', industry: 'inne' });
  });

  it('nazwa z samych niewidocznych znaków → błąd pola, bez zapisu', async () => {
    const result = await createClient(IDLE, form({ name: '\u200b\u2060\u202e\u00ad' }));
    expect(result).toEqual({ status: 'error', fieldErrors: { name: t.add.errors.nameRequired } });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('bardzo długie surowe wejście → błąd długości bez czyszczenia', async () => {
    const result = await createClient(IDLE, form({ name: ' '.repeat(1990) + 'Kadr' + ' '.repeat(10) }));
    expect(result).toEqual({ status: 'error', fieldErrors: { name: t.add.errors.nameTooLong } });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each([
    ['', t.add.errors.nameRequired],
    ['   \t ', t.add.errors.nameRequired],
    ['💇✨', t.add.errors.nameRequired],
    ['a'.repeat(81), t.add.errors.nameTooLong],
  ])('nazwa %j → błąd pola, bez zapisu', async (name, message) => {
    const result = await createClient(IDLE, form({ name, industry: 'inne' }));
    expect(result).toEqual({ status: 'error', fieldErrors: { name: message } });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('80 znaków przechodzi', async () => {
    const result = await createClient(IDLE, form({ name: 'ą'.repeat(80) }));
    expect(result.status).toBe('success');
  });

  it('branża spoza listy → błąd pola', async () => {
    const result = await createClient(IDLE, form({ name: 'Kadr', industry: 'kasyno' }));
    expect(result).toEqual({ status: 'error', fieldErrors: { industry: t.add.errors.industryInvalid } });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('brak pola nazwy (formularz zmieniony poza stroną) → błąd pola', async () => {
    const result = await createClient(IDLE, form({ industry: 'inne' }));
    expect(result).toEqual({ status: 'error', fieldErrors: { name: t.add.errors.nameRequired } });
  });

  it('bez sesji: komunikat z naprawą, bez zapisu', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const result = await createClient(IDLE, form({ name: 'Kadr' }));
    expect(result).toEqual({ status: 'error', message: t.add.errors.session });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('bez włączonych kont: błąd, bez zapisu', async () => {
    mocks.features.accounts = false;
    const result = await createClient(IDLE, form({ name: 'Kadr' }));
    expect(result).toEqual({ status: 'error', message: t.add.errors.failed });
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('błąd bazy: ogólny komunikat, bez treści błędu i nazwy klienta w logu', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.insert.mockRejectedValue(new Error('duplicate key value violates unique constraint'));
    const result = await createClient(IDLE, form({ name: 'Tajny Klient' }));
    expect(result).toEqual({ status: 'error', message: t.add.errors.failed });
    expect(JSON.stringify(result)).not.toContain('duplicate');
    expect(log).toHaveBeenCalledWith('[sedno] Dodanie klienta nie powiodło się.');
    expect(JSON.stringify(log.mock.calls)).not.toContain('Tajny Klient');
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('górna granica klientów na konto (baza): komunikat z przyczyną, bez logu i odświeżenia', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.insert.mockRejectedValue(new PanelDataError('limit'));
    const result = await createClient(IDLE, form({ name: 'Kadr' }));
    expect(result).toEqual({ status: 'error', message: t.add.errors.accountLimit(500) });
    expect(t.add.errors.accountLimit(500)).toBe(
      'Konto ma już 500 klientów, czyli najwięcej, ile mieści jedno konto.',
    );
    expect(log).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('limit: 30 klientów na 10 minut na konto, potem komunikat', async () => {
    for (let i = 0; i < 30; i++) {
      expect((await createClient(IDLE, form({ name: `Klient ${i}` }))).status).toBe('success');
    }
    expect(await createClient(IDLE, form({ name: 'Klient 31' }))).toEqual({
      status: 'error',
      message: t.add.errors.rateLimited,
    });
    // Inne konto ma własny limit.
    mocks.getCurrentUser.mockResolvedValue({ id: '33333333-3333-4333-8333-333333333333' });
    expect((await createClient(IDLE, form({ name: 'Kadr' }))).status).toBe('success');
  });

  it('błędne dane nie zużywają limitu', async () => {
    for (let i = 0; i < 40; i++) await createClient(IDLE, form({ name: '' }));
    expect((await createClient(IDLE, form({ name: 'Kadr' }))).status).toBe('success');
  });
});

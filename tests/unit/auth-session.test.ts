/**
 * lib/auth/session.ts: bez flagi kont nie sięga po Supabase (strony /app budują się bez zmiennych Supabase
 * i odpowiadają 404), z flagą — użytkownik z sesji albo przekierowanie na logowanie z bezpiecznym ?next=.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({ accounts: false, user: null as { id: string } | null, clientCalls: 0 }));

vi.mock('@/config/features', () => ({
  get features() {
    return { accounts: state.accounts };
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => {
    state.clientCalls += 1;
    return { auth: { getUser: async () => ({ data: { user: state.user } }) } };
  },
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
// cache() z Reacta poza renderem serwera nie zapamiętuje — każde wywołanie liczy od nowa.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T>(fn: T) => fn,
}));

const { getCurrentUser, requireUser } = await import('@/lib/auth/session');

beforeEach(() => {
  state.accounts = false;
  state.user = null;
  state.clientCalls = 0;
});

describe('sesja bez flagi kont', () => {
  it('getCurrentUser daje null bez tworzenia klienta Supabase', async () => {
    expect(await getCurrentUser()).toBeNull();
    expect(state.clientCalls).toBe(0);
  });

  it('requireUser daje 404, nie błąd konfiguracji ani przekierowanie', async () => {
    await expect(requireUser('/app/ustawienia')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(state.clientCalls).toBe(0);
  });
});

describe('sesja z flagą kont', () => {
  it('zwraca użytkownika z sesji', async () => {
    state.accounts = true;
    state.user = { id: 'u1' };
    expect(await requireUser('/app/ustawienia')).toEqual({ id: 'u1' });
  });

  it('bez sesji przekierowuje na logowanie z bezpiecznym adresem powrotu', async () => {
    state.accounts = true;
    await expect(requireUser('/app/klienci?m=2026-09')).rejects.toThrow(
      `NEXT_REDIRECT /logowanie?next=${encodeURIComponent('/app/klienci?m=2026-09')}`,
    );
    await expect(requireUser('https://zly.example/app')).rejects.toThrow(
      `NEXT_REDIRECT /logowanie?next=${encodeURIComponent('/app/klienci')}`,
    );
  });
});

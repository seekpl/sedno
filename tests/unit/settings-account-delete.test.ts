/**
 * Usunięcie konta w warstwie danych (lib/data/account.ts, deleteAccount): najpierw wszystkie pliki logo
 * właściciela (każdy format), a błąd magazynu przerywa usuwanie — inaczej plik zostałby bez właściciela,
 * bo po usunięciu konta nikt by go już nie usunął. Dopiero potem użytkownik Supabase Auth (kaskada w bazie).
 * „Usuń logo” (removeAccountLogo): najpierw logo_path = null, potem pliki; każdy błąd jest zgłaszany.
 * Klient z kluczem serwisowym jest podmieniony; prawdziwy stos sprawdza tests/db/account-delete.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({ readLogo: vi.fn() }));
vi.mock('@/lib/logo/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logo/store')>()),
  readLogo: mocks.readLogo,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => {
    throw new Error('deleteAccount używa klienta przekazanego przez wywołującego.');
  },
}));

const { AccountDataError, deleteAccount, removeAccountLogo } = await import('@/lib/data/account');

const USER = '11111111-1111-4111-8111-111111111111';

type Result = { error: unknown };

/** Klient z kluczem serwisowym: zapisuje kolejność wywołań (profil, magazyn, Auth). */
function fakeAdmin({
  logoPath = `${USER}/logo.png` as string | null,
  profileError = null as unknown,
  removeError = null as unknown,
  deleteError = null as unknown,
  updateError = null as unknown,
} = {}) {
  const calls: string[] = [];
  const removed: string[][] = [];
  const admin = {
    from(table: string) {
      let updating = false;
      const builder = {
        select: () => builder,
        update: (values: Record<string, unknown>) => {
          calls.push(`${table}.update=${JSON.stringify(values)}`);
          updating = true;
          return builder;
        },
        eq: (column: string, value: string) => {
          calls.push(`${table}.${column}=${value}`);
          return updating ? Promise.resolve({ error: updateError }) : builder;
        },
        maybeSingle: async () => ({
          data: profileError ? null : { logo_path: logoPath },
          error: profileError,
        }),
      };
      return builder;
    },
    storage: {
      from(bucket: string) {
        return {
          remove: async (paths: string[]): Promise<Result & { data: unknown }> => {
            calls.push(`storage.${bucket}.remove`);
            removed.push(paths);
            return { data: removeError ? null : [], error: removeError };
          },
        };
      },
    },
    auth: {
      admin: {
        deleteUser: async (id: string): Promise<Result> => {
          calls.push(`auth.deleteUser=${id}`);
          return { error: deleteError };
        },
      },
    },
  };
  return { admin, calls, removed };
}

beforeEach(() => {
  mocks.readLogo.mockReset().mockResolvedValue(null);
});

describe('deleteAccount (warstwa danych)', () => {
  it('usuwa pliki logo we wszystkich formatach, a potem użytkownika Auth z sesji', async () => {
    const { admin, calls, removed } = fakeAdmin();
    await deleteAccount(admin as never, USER);
    expect(removed).toEqual([[`${USER}/logo.png`, `${USER}/logo.jpg`, `${USER}/logo.webp`]]);
    expect(calls).toEqual([`profiles.id=${USER}`, 'storage.logos.remove', `auth.deleteUser=${USER}`]);
    expect(mocks.readLogo).toHaveBeenCalledWith(`${USER}/logo.png`);
  });

  it('bez logo w profilu też czyści magazyn (np. stary plik w innym formacie)', async () => {
    const { admin, calls } = fakeAdmin({ logoPath: null });
    await deleteAccount(admin as never, USER);
    expect(calls).toContain('storage.logos.remove');
    expect(calls.at(-1)).toBe(`auth.deleteUser=${USER}`);
    expect(mocks.readLogo).not.toHaveBeenCalled();
  });

  it('błąd magazynu: wyjątek, konto zostaje (bez usuwania użytkownika)', async () => {
    const { admin, calls } = fakeAdmin({ removeError: { message: 'storage down: secret' } });
    const error = await deleteAccount(admin as never, USER).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AccountDataError);
    expect((error as InstanceType<typeof AccountDataError>).step).toBe('logo');
    expect(String(error)).not.toContain('secret');
    expect(calls.some((c) => c.startsWith('auth.'))).toBe(false);
  });

  it('plik logo nadal jest w magazynie: wyjątek, konto zostaje', async () => {
    mocks.readLogo.mockResolvedValue({ bytes: new Uint8Array([1]), contentType: 'image/png' });
    const { admin, calls } = fakeAdmin();
    await expect(deleteAccount(admin as never, USER)).rejects.toBeInstanceOf(AccountDataError);
    expect(calls.some((c) => c.startsWith('auth.'))).toBe(false);
  });

  it('magazyn nie odpowiada przy sprawdzaniu, czy plik zniknął: wyjątek „logo”, konto zostaje', async () => {
    mocks.readLogo.mockRejectedValue(new Error('storage down: secret'));
    const { admin, calls } = fakeAdmin();
    const error = await deleteAccount(admin as never, USER).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AccountDataError);
    expect((error as InstanceType<typeof AccountDataError>).step).toBe('logo');
    expect(calls.some((c) => c.startsWith('auth.'))).toBe(false);
  });

  it('błąd odczytu profilu: wyjątek przed usuwaniem czegokolwiek', async () => {
    const { admin, calls } = fakeAdmin({ profileError: { message: 'secret' } });
    await expect(deleteAccount(admin as never, USER)).rejects.toBeInstanceOf(AccountDataError);
    expect(calls).toEqual([`profiles.id=${USER}`]);
  });

  it('błąd Supabase Auth: wyjątek „delete” bez treści błędu', async () => {
    const { admin } = fakeAdmin({ deleteError: { message: 'auth: secret' } });
    const error = await deleteAccount(admin as never, USER).catch((e: unknown) => e);
    expect((error as InstanceType<typeof AccountDataError>).step).toBe('delete');
    expect(String(error)).not.toContain('secret');
  });
});

describe('removeAccountLogo — „Usuń logo” ze sprawdzaniem błędów', () => {
  it('najpierw czyści logo_path własnego profilu, potem usuwa pliki we wszystkich formatach', async () => {
    const { admin, calls, removed } = fakeAdmin();
    await removeAccountLogo(admin as never, USER);
    expect(calls).toEqual([
      'profiles.update={"logo_path":null}',
      `profiles.id=${USER}`,
      'storage.logos.remove',
    ]);
    expect(removed).toEqual([[`${USER}/logo.png`, `${USER}/logo.jpg`, `${USER}/logo.webp`]]);
  });

  it('błąd zapisu profilu: wyjątek „logo” bez treści błędu, pliki zostają', async () => {
    const { admin, calls } = fakeAdmin({ updateError: { message: 'profiles: secret' } });
    const error = await removeAccountLogo(admin as never, USER).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AccountDataError);
    expect((error as InstanceType<typeof AccountDataError>).step).toBe('logo');
    expect(String(error)).not.toContain('secret');
    expect(calls).not.toContain('storage.logos.remove');
  });

  it('błąd magazynu: wyjątek „logo” (interfejs nie pokaże „Logo usunięte”)', async () => {
    const { admin } = fakeAdmin({ removeError: { message: 'storage down: secret' } });
    const error = await removeAccountLogo(admin as never, USER).catch((e: unknown) => e);
    expect((error as InstanceType<typeof AccountDataError>).step).toBe('logo');
    expect(String(error)).not.toContain('secret');
  });
});

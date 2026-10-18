/**
 * lib/logo/store.ts bez sieci (podstawiony klient Supabase): brak pliku → null, awaria magazynu →
 * LogoStoreError (trasy dają 503, nie 404), kolejność zapisu (profil przed sprzątaniem starych formatów)
 * i usunięcia (profil przed plikami), żaden błąd nie kończy się cichym sukcesem.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

type Result = { data?: unknown; error: unknown };
const calls: string[] = [];
const next = {
  upload: { error: null } as Result,
  remove: { error: null } as Result,
  profile: { error: null } as Result,
  download: { data: null, error: null } as Result,
};

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        upload: async (path: string) => (calls.push(`upload ${path}`), next.upload),
        remove: async (paths: string[]) => (calls.push(`remove ${paths.join(',')}`), next.remove),
        download: async (path: string) => (calls.push(`download ${path}`), next.download),
      }),
    },
    from: () => ({
      update: (values: { logo_path: string | null }) => ({
        eq: async () => (calls.push(`profile ${values.logo_path}`), next.profile),
      }),
    }),
  }),
}));

const { LogoStoreError, readLogo, removeLogo, saveLogo } = await import('@/lib/logo/store');

const ID = '11111111-2222-3333-4444-555555555555';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const blob = (bytes: Uint8Array) => ({ arrayBuffer: async () => bytes.buffer });

beforeEach(() => {
  calls.length = 0;
  next.upload = { error: null };
  next.remove = { error: null };
  next.profile = { error: null };
  next.download = { data: null, error: null };
});

describe('readLogo', () => {
  it('zwraca bajty i typ z sygnatury', async () => {
    next.download = { data: blob(PNG), error: null };
    expect(await readLogo(`${ID}/logo.png`)).toEqual({ bytes: PNG, contentType: 'image/png' });
  });

  it('brak pliku (404 albo 400 z kodem 404) to null', async () => {
    next.download = { data: null, error: { status: 404, statusCode: '404', message: 'not found' } };
    expect(await readLogo(`${ID}/logo.png`)).toBeNull();
    next.download = { data: null, error: { status: 400, statusCode: '404', message: 'Object not found' } };
    expect(await readLogo(`${ID}/logo.png`)).toBeNull();
  });

  it('awaria magazynu to LogoStoreError, nie „brak logo”', async () => {
    next.download = { data: null, error: { status: 500, statusCode: '500', message: 'internal' } };
    await expect(readLogo(`${ID}/logo.png`)).rejects.toBeInstanceOf(LogoStoreError);
    next.download = { data: null, error: { message: 'fetch failed' } };
    await expect(readLogo(`${ID}/logo.png`)).rejects.toBeInstanceOf(LogoStoreError);
  });

  it('ścieżka spoza wzorca nie trafia do magazynu', async () => {
    expect(await readLogo('../etc/passwd')).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe('saveLogo', () => {
  it('plik, potem profil, na końcu sprzątanie starych formatów', async () => {
    await saveLogo(ID, PNG, { ext: 'png', contentType: 'image/png' });
    expect(calls).toEqual([
      `upload ${ID}/logo.png`,
      `profile ${ID}/logo.png`,
      `remove ${ID}/logo.jpg,${ID}/logo.webp`,
    ]);
  });

  it('nieudany zapis profilu nie usuwa poprzedniego logo', async () => {
    next.profile = { error: { message: 'db down' } };
    await expect(saveLogo(ID, PNG, { ext: 'png', contentType: 'image/png' })).rejects.toBeInstanceOf(
      LogoStoreError,
    );
    expect(calls.some((c) => c.startsWith('remove'))).toBe(false);
  });

  it('nieudany zapis pliku nie zmienia profilu', async () => {
    next.upload = { error: { message: 'storage down' } };
    await expect(saveLogo(ID, PNG, { ext: 'png', contentType: 'image/png' })).rejects.toBeInstanceOf(
      LogoStoreError,
    );
    expect(calls).toEqual([`upload ${ID}/logo.png`]);
  });
});

describe('removeLogo', () => {
  it('najpierw profil, potem pliki we wszystkich formatach', async () => {
    await removeLogo(ID);
    expect(calls).toEqual([`profile null`, `remove ${ID}/logo.png,${ID}/logo.jpg,${ID}/logo.webp`]);
  });

  it('błąd profilu albo magazynu to LogoStoreError, nie cichy sukces', async () => {
    next.profile = { error: { message: 'db down' } };
    await expect(removeLogo(ID)).rejects.toBeInstanceOf(LogoStoreError);
    expect(calls).toEqual(['profile null']);
    next.profile = { error: null };
    next.remove = { error: { message: 'storage down' } };
    await expect(removeLogo(ID)).rejects.toBeInstanceOf(LogoStoreError);
  });
});

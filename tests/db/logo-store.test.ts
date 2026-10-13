/**
 * lib/logo/store.ts na lokalnym stosie (emulacja magazynu w bramce): zapis z typem z sygnatury, jedna wersja
 * logo na właściciela, logo_path w profilu, odczyt i usunięcie.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ANON_KEY, SERVICE_ROLE_KEY, SUPABASE_URL } from '../../scripts/local-supabase/config';
import { createUser, deleteUser, sql, type TestUser } from './helpers';

vi.mock('server-only', () => ({}));
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

const { readLogo, removeLogo, saveLogo } = await import('@/lib/logo/store');
const { checkLogo } = await import('@/lib/logo/validate');

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]);

let user: TestUser;
beforeAll(async () => {
  user = await createUser('logo');
});
afterAll(async () => {
  await deleteUser(user.id);
});

describe('magazyn logo', () => {
  it('zapis, zamiana formatu, odczyt i usunięcie', async () => {
    const pngKind = checkLogo(png);
    if (!pngKind.ok) throw new Error('png');
    const first = await saveLogo(user.id, png, pngKind);
    expect(first).toBe(`${user.id}/logo.png`);
    expect((await sql('select logo_path from public.profiles where id = $1', [user.id]))[0]?.logo_path).toBe(
      first,
    );

    const jpgKind = checkLogo(jpg);
    if (!jpgKind.ok) throw new Error('jpg');
    const second = await saveLogo(user.id, jpg, jpgKind);
    expect(second).toBe(`${user.id}/logo.jpg`);
    expect(await readLogo(first)).toBeNull();
    const read = await readLogo(second);
    expect(read?.contentType).toBe('image/jpeg');
    expect([...read!.bytes]).toEqual([...jpg]);

    await removeLogo(user.id);
    expect(await readLogo(second)).toBeNull();
    expect(
      (await sql('select logo_path from public.profiles where id = $1', [user.id]))[0]?.logo_path,
    ).toBeNull();
  });

  it('nie czyta ścieżek spoza wzorca', async () => {
    expect(await readLogo('../etc/passwd')).toBeNull();
    expect(await readLogo(`${user.id}/inny.png`)).toBeNull();
    expect(await readLogo(null)).toBeNull();
  });
});

/**
 * Akcje Ustawień (app/app/ustawienia/actions.ts): sesja, flaga kont, zod na wejściu (imię i nazwa na
 * raporcie do 80 znaków, plik logo, słowo potwierdzenia), limity, revalidatePath, błędy bez treści bazy,
 * logo z przyczyną i naprawą, usunięcie konta tylko po potwierdzeniu, potem wylogowanie i przekierowanie.
 * Baza, magazyn i sesja są podmienione; prawdziwą bazę sprawdzają tests/db/settings-*.test.ts
 * i tests/db/account-*.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { settings as t } from '@/lib/copy/settings';

vi.mock('server-only', () => ({}));

class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}

const mocks = vi.hoisted(() => ({
  features: { accounts: true },
  getCurrentUser: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  saveProfile: vi.fn(),
  saveLogo: vi.fn(),
  removeLogo: vi.fn(),
  deleteAccount: vi.fn(),
  signOut: vi.fn(),
  cookieDelete: vi.fn(),
  cookies: [] as { name: string; value: string }[],
  db: { marker: 'db' } as Record<string, unknown>,
  admin: { marker: 'admin' },
}));

vi.mock('@/config/features', () => ({ features: mocks.features }));
vi.mock('@/lib/auth/session', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => mocks.db }));
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => mocks.admin }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => mocks.cookies, delete: mocks.cookieDelete }),
}));
vi.mock('@/lib/data/profile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/profile')>()),
  updateProfile: mocks.saveProfile,
}));
vi.mock('@/lib/logo/store', () => ({ saveLogo: mocks.saveLogo, removeLogo: mocks.removeLogo }));
vi.mock('@/lib/data/account', () => ({ deleteAccount: mocks.deleteAccount }));

const { updateProfile, uploadLogo, removeLogo, deleteAccount } = await import('@/app/app/ustawienia/actions');
const { profileInputSchema } = await import('@/lib/data/profile');
const { resetRateLimits } = await import('@/lib/server/rate-limit');
const { LOGO_MAX_BYTES } = await import('@/lib/logo/validate');

const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'anna@example.com' };
const IDLE = { status: 'idle' } as const;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3];
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>');

function form(fields: Record<string, string | Blob>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const file = (bytes: ArrayLike<number> | Uint8Array, name = 'logo.png', type = 'image/png') =>
  new File([Uint8Array.from(bytes)], name, { type });

beforeEach(() => {
  mocks.features.accounts = true;
  mocks.getCurrentUser.mockReset().mockResolvedValue(USER);
  mocks.revalidatePath.mockReset();
  mocks.redirect.mockReset().mockImplementation((url: string) => {
    throw new RedirectError(url);
  });
  mocks.saveProfile
    .mockReset()
    .mockImplementation(async (_db, _id, input: { displayName: string; brandName: string }) => ({
      displayName: input.displayName.trim() || null,
      brandName: input.brandName.trim() || null,
    }));
  mocks.saveLogo.mockReset().mockResolvedValue(`${USER.id}/logo.png`);
  mocks.removeLogo.mockReset().mockResolvedValue(undefined);
  mocks.deleteAccount.mockReset().mockResolvedValue(undefined);
  mocks.signOut.mockReset().mockResolvedValue({ error: null });
  mocks.cookieDelete.mockReset();
  mocks.cookies = [
    { name: 'sb-127-auth-token', value: 'a' },
    { name: 'sb-127-auth-token.0', value: 'b' },
    { name: 'sb-127-auth-token-code-verifier', value: 'c' },
    { name: 'inne', value: 'd' },
  ];
  mocks.db = { marker: 'db', auth: { signOut: mocks.signOut } };
  resetRateLimits();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Profil i marka — updateProfile', () => {
  it('zapisuje imię i nazwę na raporcie użytkownika z sesji i odświeża Ustawienia', async () => {
    const result = await updateProfile(IDLE, form({ displayName: 'Anna', brandName: 'Kadr Social' }));
    expect(result).toEqual({ status: 'success', displayName: 'Anna', brandName: 'Kadr Social' });
    expect(mocks.saveProfile).toHaveBeenCalledWith(mocks.db, USER.id, {
      displayName: 'Anna',
      brandName: 'Kadr Social',
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/app/ustawienia');
  });

  it('pomija pola spoza formularza (plan, logo_path, id)', async () => {
    await updateProfile(
      IDLE,
      form({ displayName: 'Anna', brandName: '', plan: 'solo', logo_path: 'x/logo.png', id: 'cudzy' }),
    );
    expect(mocks.saveProfile).toHaveBeenCalledWith(mocks.db, USER.id, { displayName: 'Anna', brandName: '' });
  });

  it('nazwa dłuższa niż 80 znaków: błąd pod polem, wpisane wartości zostają, bez zapisu', async () => {
    const long = 'a'.repeat(81);
    const result = await updateProfile(IDLE, form({ displayName: 'Anna', brandName: long }));
    expect(result).toEqual({
      status: 'error',
      values: { displayName: 'Anna', brandName: long },
      fieldErrors: { brandName: t.profile.errors.brandNameTooLong },
    });
    expect(mocks.saveProfile).not.toHaveBeenCalled();
  });

  it('80 znaków liczy jak baza (polskie litery to po jednym znaku)', async () => {
    const name = 'ż'.repeat(80);
    const result = await updateProfile(IDLE, form({ displayName: name, brandName: '' }));
    expect(result.status).toBe('success');
    const tooLong = await updateProfile(IDLE, form({ displayName: `${name}ż`, brandName: '' }));
    expect(tooLong).toMatchObject({ fieldErrors: { displayName: t.profile.errors.displayNameTooLong } });
  });

  it('bez sesji: komunikat o sesji, bez zapisu', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const result = await updateProfile(IDLE, form({ displayName: 'Anna', brandName: 'Kadr' }));
    expect(result).toMatchObject({ status: 'error', message: t.profile.errors.session });
    expect(mocks.saveProfile).not.toHaveBeenCalled();
  });

  it('bez flagi kont nic nie zapisuje', async () => {
    mocks.features.accounts = false;
    const result = await updateProfile(IDLE, form({ displayName: 'Anna', brandName: 'Kadr' }));
    expect(result).toMatchObject({ status: 'error', message: t.profile.errors.failed });
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it('błąd bazy: ogólny komunikat bez treści błędu, wpisane wartości zostają', async () => {
    mocks.saveProfile.mockRejectedValue(new Error('duplicate key value violates … secret'));
    const result = await updateProfile(IDLE, form({ displayName: 'Anna', brandName: 'Kadr' }));
    expect(result).toEqual({
      status: 'error',
      values: { displayName: 'Anna', brandName: 'Kadr' },
      message: t.profile.errors.failed,
    });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('secret');
  });

  it('limit zapisów na konto', async () => {
    for (let i = 0; i < 30; i++) await updateProfile(IDLE, form({ displayName: 'A', brandName: '' }));
    const result = await updateProfile(IDLE, form({ displayName: 'A', brandName: '' }));
    expect(result).toMatchObject({ status: 'error', message: t.profile.errors.rateLimited });
  });
});

describe('Logo — uploadLogo', () => {
  it('zapisuje PNG użytkownika z sesji z typem z sygnatury', async () => {
    const result = await uploadLogo(IDLE, form({ logo: file(PNG) }));
    expect(result).toMatchObject({ status: 'success', result: 'uploaded', hasLogo: true });
    expect(mocks.saveLogo).toHaveBeenCalledWith(USER.id, Uint8Array.from(PNG), {
      ext: 'png',
      contentType: 'image/png',
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/app/ustawienia');
  });

  it('typ z bajtów, nie z nazwy: JPEG nazwany .png zapisuje się jako JPEG', async () => {
    await uploadLogo(IDLE, form({ logo: file([0xff, 0xd8, 0xff, 0xe0, 1], 'logo.png', 'image/png') }));
    expect(mocks.saveLogo).toHaveBeenCalledWith(USER.id, expect.any(Uint8Array), {
      ext: 'jpg',
      contentType: 'image/jpeg',
    });
  });

  it('SVG (także podpisane jako PNG): „unsupported”, bez zapisu', async () => {
    for (const logo of [file(SVG, 'logo.svg', 'image/svg+xml'), file(SVG, 'logo.png', 'image/png')]) {
      const result = await uploadLogo(IDLE, form({ logo }));
      expect(result).toEqual({ status: 'error', code: 'unsupported' });
    }
    expect(mocks.saveLogo).not.toHaveBeenCalled();
  });

  it('pusty plik: „empty”; brak pliku albo tekst zamiast pliku: „noFile”', async () => {
    expect(await uploadLogo(IDLE, form({ logo: file([]) }))).toEqual({ status: 'error', code: 'empty' });
    expect(await uploadLogo(IDLE, form({ logo: new File([], '') }))).toEqual({
      status: 'error',
      code: 'noFile',
    });
    expect(await uploadLogo(IDLE, form({ logo: 'logo.png' }))).toEqual({ status: 'error', code: 'noFile' });
    expect(await uploadLogo(IDLE, new FormData())).toEqual({ status: 'error', code: 'noFile' });
    expect(mocks.saveLogo).not.toHaveBeenCalled();
  });

  it('za duży plik: „tooBig” z rozmiaru, bez czytania bajtów', async () => {
    const big = file(new Uint8Array(LOGO_MAX_BYTES + 1));
    const read = vi.spyOn(big, 'arrayBuffer');
    const result = await uploadLogo(IDLE, form({ logo: big }));
    expect(result).toEqual({ status: 'error', code: 'tooBig' });
    expect(read).not.toHaveBeenCalled();
    expect(mocks.saveLogo).not.toHaveBeenCalled();
  });

  it('każdy kod błędu pliku ma przyczynę i naprawę w tekstach', () => {
    for (const code of ['noFile', 'empty', 'tooBig', 'unsupported'] as const) {
      expect(t.logo.errors[code].title.length).toBeGreaterThan(5);
      expect(t.logo.errors[code].hint.length).toBeGreaterThan(10);
    }
    expect(t.logo.errors.unsupported.hint).toContain('SVG');
    expect(t.logo.errors.tooBig.title).toContain('2 MB');
  });

  it('bez sesji: komunikat o sesji', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect(await uploadLogo(IDLE, form({ logo: file(PNG) }))).toEqual({
      status: 'error',
      message: t.logo.errors.session,
    });
    expect(mocks.saveLogo).not.toHaveBeenCalled();
  });

  it('błąd magazynu: ogólny komunikat bez szczegółów', async () => {
    mocks.saveLogo.mockRejectedValue(new Error('bucket logos: secret detail'));
    expect(await uploadLogo(IDLE, form({ logo: file(PNG) }))).toEqual({
      status: 'error',
      message: t.logo.errors.failed,
    });
  });

  it('limit zmian logo na konto', async () => {
    for (let i = 0; i < 20; i++) await uploadLogo(IDLE, form({ logo: file(PNG) }));
    expect(await uploadLogo(IDLE, form({ logo: file(PNG) }))).toEqual({
      status: 'error',
      message: t.logo.errors.rateLimited,
    });
  });
});

describe('Logo — removeLogo', () => {
  it('usuwa logo użytkownika z sesji', async () => {
    const result = await removeLogo();
    expect(result).toMatchObject({ status: 'success', result: 'removed', hasLogo: false });
    expect(mocks.removeLogo).toHaveBeenCalledWith(USER.id);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/app/ustawienia');
  });

  it('bez sesji nic nie usuwa', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect(await removeLogo()).toEqual({ status: 'error', message: t.logo.errors.session });
    expect(mocks.removeLogo).not.toHaveBeenCalled();
  });
});

describe('Usuń konto — deleteAccount', () => {
  it.each(['usuń', '  USUŃ ', 'Usun'])(
    'potwierdzenie „%s”: usuwa konto, wylogowuje i przekierowuje',
    async (word) => {
      await expect(deleteAccount(IDLE, form({ confirm: word }))).rejects.toEqual(new RedirectError('/'));
      expect(mocks.deleteAccount).toHaveBeenCalledWith(mocks.admin, USER.id);
      expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(mocks.cookieDelete.mock.calls.map(([name]) => name)).toEqual([
        'sb-127-auth-token',
        'sb-127-auth-token.0',
        'sb-127-auth-token-code-verifier',
      ]);
    },
  );

  it.each(['', 'tak', 'usuń konto', 'delete'])('bez słowa „usuń” („%s”) nic nie usuwa', async (word) => {
    const result = await deleteAccount(IDLE, form({ confirm: word }));
    expect(result).toEqual({ status: 'error', fieldError: t.deleteAccount.errors.confirm });
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('bez pola potwierdzenia nic nie usuwa', async () => {
    const result = await deleteAccount(IDLE, new FormData());
    expect(result).toEqual({ status: 'error', fieldError: t.deleteAccount.errors.confirm });
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it('bez sesji: komunikat o sesji, bez usuwania', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const result = await deleteAccount(IDLE, form({ confirm: 'usuń' }));
    expect(result).toEqual({ status: 'error', message: t.deleteAccount.errors.session });
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it('usuwa zawsze konto z sesji, nie identyfikator z formularza', async () => {
    await expect(
      deleteAccount(IDLE, form({ confirm: 'usuń', userId: '22222222-2222-4222-8222-222222222222' })),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(mocks.deleteAccount).toHaveBeenCalledWith(mocks.admin, USER.id);
  });

  it('błąd usuwania: komunikat (konto nadal działa), bez wylogowania i przekierowania', async () => {
    mocks.deleteAccount.mockRejectedValue(new Error('auth admin: secret'));
    const result = await deleteAccount(IDLE, form({ confirm: 'usuń' }));
    expect(result).toEqual({ status: 'error', message: t.deleteAccount.errors.failed });
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('nieudane wylogowanie w Supabase nie cofa usunięcia: ciasteczka i tak znikają', async () => {
    mocks.signOut.mockRejectedValue(new Error('network'));
    await expect(deleteAccount(IDLE, form({ confirm: 'usuń' }))).rejects.toBeInstanceOf(RedirectError);
    expect(mocks.cookieDelete).toHaveBeenCalledTimes(3);
  });

  it('błąd przy kończeniu sesji po usunięciu konta: przekierowanie, bez komunikatu „konto nadal działa”', async () => {
    mocks.cookieDelete.mockImplementation(() => {
      throw new Error('cookies');
    });
    await expect(deleteAccount(IDLE, form({ confirm: 'usuń' }))).rejects.toEqual(new RedirectError('/'));
    expect(mocks.deleteAccount).toHaveBeenCalledTimes(1);
  });

  it('limit prób usunięcia', async () => {
    for (let i = 0; i < 5; i++) {
      mocks.deleteAccount.mockRejectedValueOnce(new Error('x'));
      await deleteAccount(IDLE, form({ confirm: 'usuń' }));
    }
    expect(await deleteAccount(IDLE, form({ confirm: 'usuń' }))).toEqual({
      status: 'error',
      message: t.deleteAccount.errors.rateLimited,
    });
  });
});

describe('profileInputSchema — czyszczenie jak nazwa klienta', () => {
  it('usuwa znaki zerowej szerokości i sterowanie kierunkiem tekstu, zwija spacje, puste → null', () => {
    expect(
      profileInputSchema.parse({ displayName: ' An\u200Bna\u202E ', brandName: 'Kadr\u2066\t\nSocial\uFEFF' }),
    ).toEqual({ displayName: 'Anna', brandName: 'Kadr Social' });
    expect(profileInputSchema.parse({ displayName: '\u200B\u200E', brandName: ' \u0007 ' })).toEqual({
      displayName: null,
      brandName: null,
    });
  });

  it('nazwa na raporcie bez emoji; imię zachowuje emoji, także złożone (łącznik U+200D zostaje)', () => {
    const coder = '\u{1F469}\u200D\u{1F4BB}';
    expect(profileInputSchema.parse({ displayName: `Anna ${coder}`, brandName: `Kadr ${coder} ✨` })).toEqual({
      displayName: `Anna ${coder}`,
      brandName: 'Kadr',
    });
  });

  it('brak pola: null (to samo czyszczenie co pusty tekst)', () => {
    expect(profileInputSchema.parse({})).toEqual({ displayName: null, brandName: null });
  });

  it('limit 80 znaków po oczyszczeniu (znaki formatujące się nie liczą)', () => {
    expect(profileInputSchema.parse({ brandName: `${'a'.repeat(80)}\u200B\u200B` }).brandName).toHaveLength(80);
    expect(profileInputSchema.safeParse({ brandName: 'a'.repeat(81) }).success).toBe(false);
  });
});

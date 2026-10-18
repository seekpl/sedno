/**
 * lib/data/profile.ts na lokalnym stosie: własny profil przez RLS, zapis imienia i nazwy na raporcie
 * (oczyszczone), brak dostępu do cudzego profilu oraz do kolumn planu i logo (granty kolumnowe).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createUser, deleteUser, sql, type TestUser } from './helpers';

vi.mock('server-only', () => ({}));

const { getLogoPath, getPlan, getProfile, ProfileDataError, updateProfile } =
  await import('@/lib/data/profile');

let a: TestUser;
let b: TestUser;

beforeAll(async () => {
  [a, b] = await Promise.all([createUser('profile-a'), createUser('profile-b')]);
});

afterAll(async () => {
  await Promise.all([deleteUser(a.id), deleteUser(b.id)]);
});

const profileRow = async (id: string) =>
  (await sql('select display_name, brand_name, plan, logo_path from public.profiles where id = $1', [id]))[0];

describe('profil', () => {
  it('odczyt własnego profilu: plan darmowy, bez logo', async () => {
    const profile = await getProfile(a.db);
    expect(profile).toMatchObject({ displayName: null, brandName: null, plan: 'free', hasLogo: false });
    expect(await getPlan(a.db)).toBe('free');
    expect(await getLogoPath(a.db)).toBeNull();
  });

  it('zapis imienia i nazwy na raporcie (oczyszczone, bez emoji w nazwie na raporcie)', async () => {
    const saved = await updateProfile(a.db, a.id, {
      displayName: '  Anna  ',
      brandName: 'Kadr   Social ✨',
    });
    expect(saved).toEqual({ displayName: 'Anna', brandName: 'Kadr Social' });
    expect(await profileRow(a.id)).toMatchObject({ display_name: 'Anna', brand_name: 'Kadr Social' });
    expect(await getProfile(a.db)).toMatchObject({ displayName: 'Anna', brandName: 'Kadr Social' });
  });

  it('puste pola zapisują null', async () => {
    await updateProfile(a.db, a.id, { displayName: 'Anna', brandName: 'Kadr' });
    expect(await updateProfile(a.db, a.id, { displayName: ' ', brandName: '' })).toEqual({
      displayName: null,
      brandName: null,
    });
    expect(await profileRow(a.id)).toMatchObject({ display_name: null, brand_name: null });
  });

  it('cudzy profil: nie do zmiany (RLS), jego dane bez zmian', async () => {
    await updateProfile(b.db, b.id, { displayName: 'Bartek', brandName: 'Studio B' });
    await expect(
      updateProfile(a.db, b.id, { displayName: 'Atak', brandName: 'Atak' }),
    ).rejects.toBeInstanceOf(ProfileDataError);
    expect(await profileRow(b.id)).toMatchObject({ display_name: 'Bartek', brand_name: 'Studio B' });
    expect(await getProfile(a.db)).not.toMatchObject({ displayName: 'Bartek' });
  });

  it('użytkownik nie zmieni planu ani ścieżki logo (granty kolumnowe)', async () => {
    const plan = await a.db
      .from('profiles')
      .update({ plan: 'solo' } as never)
      .eq('id', a.id);
    expect(plan.error).not.toBeNull();
    const logo = await a.db
      .from('profiles')
      .update({ logo_path: `${a.id}/logo.png` } as never)
      .eq('id', a.id);
    expect(logo.error).not.toBeNull();
    expect(await profileRow(a.id)).toMatchObject({ plan: 'free', logo_path: null });
  });

  it('za długa nazwa: błąd walidacji, bez zapisu', async () => {
    await updateProfile(a.db, a.id, { displayName: 'Anna', brandName: 'Kadr' });
    await expect(
      updateProfile(a.db, a.id, { displayName: 'Anna', brandName: 'x'.repeat(81) }),
    ).rejects.toThrow();
    expect(await profileRow(a.id)).toMatchObject({ brand_name: 'Kadr' });
  });
});

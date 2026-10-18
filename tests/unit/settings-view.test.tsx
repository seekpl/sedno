// @vitest-environment jsdom
/**
 * Ustawienia w przeglądarce (jsdom): sekcje i nagłówki, plan z cenami z config/pricing.ts bez przycisków
 * zakupu, eksport i wylogowanie, formularz profilu (etykiety, błędy przez aria-describedby, fokus,
 * „Zapisz” → „Zapisano”), logo (podgląd, wstępne sprawdzenie pliku, „Logo wgrane”, „Logo usunięte”),
 * okno „Usuń konto” (potwierdzenie słowem, pułapka fokusu, Esc) i strona z AppShell. Akcje są podmienione.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeleteAccountState, LogoState, ProfileState } from '@/app/app/ustawienia/actions';
import { ToastProvider } from '@/components/ui/Toast';
import { formatPrice, PLANS } from '@/config/pricing';
import { settings as t } from '@/lib/copy/settings';
import type { Profile } from '@/lib/data/profile';

vi.mock('server-only', () => ({}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), redirect: vi.fn() }));

const action = vi.hoisted(() => ({
  updateProfile: vi.fn<(prev: ProfileState, data: FormData) => Promise<ProfileState>>(),
  uploadLogo: vi.fn<(prev: LogoState, data: FormData) => Promise<LogoState>>(),
  removeLogo: vi.fn<() => Promise<LogoState>>(),
  deleteAccount: vi.fn<(prev: DeleteAccountState, data: FormData) => Promise<DeleteAccountState>>(),
}));
vi.mock('@/app/app/ustawienia/actions', () => action);

const data = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getProfile: vi.fn(),
  db: { marker: 'db' },
}));
vi.mock('@/lib/auth/session', () => ({ requireUser: data.requireUser }));
vi.mock('@/lib/data/profile', () => ({ getProfile: data.getProfile }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => data.db }));

const { SettingsView } = await import('@/components/app/settings/SettingsView');
const { precheckLogo } = await import('@/components/app/settings/LogoSection');
const { default: SettingsPage, metadata } = await import('@/app/app/ustawienia/page');
const { LOGO_MAX_BYTES } = await import('@/lib/logo/validate');

const PROFILE: Profile = {
  displayName: 'Anna',
  brandName: 'Kadr Social',
  plan: 'free',
  hasLogo: false,
  createdAt: '2026-09-01T09:00:00Z',
};

function renderView(profile: Partial<Profile> = {}) {
  return render(
    <ToastProvider>
      <SettingsView profile={{ ...PROFILE, ...profile }} email="anna@example.com" logoVersion="v1" />
    </ToastProvider>,
  );
}

/** Testing Library porównuje tekst ze zwykłymi spacjami (twarda spacja w kwotach z Intl). */
const spaced = (text: string) => text.replace(/\s/g, ' ');

const section = (name: string) =>
  screen.getByRole('heading', { level: 2, name }).closest('section') as HTMLElement;

beforeEach(() => {
  for (const fn of Object.values(action)) fn.mockReset();
});

afterEach(cleanup);

describe('Ustawienia — układ i treść', () => {
  it('h1 i sekcje jako nagłówki h2', () => {
    renderView();
    expect(screen.getByRole('heading', { level: 1, name: t.heading })).toBeTruthy();
    const h2 = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(h2).toEqual([
      t.profile.title,
      t.logo.title,
      t.plan.current(PLANS.free.name),
      t.data.title,
      t.deleteAccount.title,
      t.signOut.title,
    ]);
    expect(screen.getByText(t.profile.email('anna@example.com'))).toBeTruthy();
  });

  it('plan: nazwa i cena z config/pricing.ts, Solo „Wkrótce” bez przycisku zakupu', () => {
    renderView();
    const plan = section(t.plan.current(PLANS.free.name));
    expect(within(plan).getByText(spaced(formatPrice(PLANS.free.netMonthly))).className).toContain('sd-num');
    expect(within(plan).getByRole('heading', { level: 3, name: PLANS.solo.name })).toBeTruthy();
    expect(within(plan).getByText(spaced(formatPrice(PLANS.solo.netMonthly))).className).toContain('sd-num');
    expect(within(plan).getByText(t.plan.soon).className).toContain('sd-badge');
    expect(within(plan).getByText(`${t.plan.perMonth} · do 10 klientów`)).toBeTruthy();
    const features = within(plan)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(features).toEqual([
      'Twoje logo zamiast naszej stopki',
      'Historia i porównanie miesięcy',
      `Bez limitu raportów dla ${PLANS.solo.clients} klientów`,
    ]);
    for (const li of within(plan).getAllByRole('listitem'))
      expect(li.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
    expect(plan.textContent).not.toContain('Najczęściej wybierany');
    expect(within(plan).queryAllByRole('button')).toEqual([]);
    expect(within(plan).queryAllByRole('link')).toEqual([]);
    expect(plan.textContent).toContain('Przygotowano w Sedno');
    // Wersja testowa: logo i historia działają już teraz (lista Solo to zapowiedź, nie brakujące funkcje).
    expect(plan.textContent).toContain('raporty, linki, logo i historia działają');
  });

  it('plan Solo: bez karty „Wkrótce”', () => {
    renderView({ plan: 'solo' });
    expect(screen.getByRole('heading', { level: 2, name: t.plan.current('Solo') })).toBeTruthy();
    expect(screen.queryByText(t.plan.soon)).toBeNull();
  });

  it('eksport danych: link do pliku JSON', () => {
    renderView();
    const link = within(section(t.data.title)).getByRole('link', { name: t.data.download });
    expect(link.getAttribute('href')).toBe('/app/ustawienia/eksport');
    expect(link.hasAttribute('download')).toBe(true);
    expect(link.className).toContain('sd-btn');
  });

  it('wylogowanie: zwykły formularz POST na /auth/wyloguj', () => {
    renderView();
    const button = within(section(t.signOut.title)).getByRole('button', { name: t.signOut.button });
    const form = button.closest('form') as HTMLFormElement;
    expect(form.getAttribute('method')).toBe('post');
    expect(form.getAttribute('action')).toBe('/auth/wyloguj');
    expect(button.getAttribute('type')).toBe('submit');
  });
});

describe('Ustawienia — profil i marka', () => {
  const displayName = () => screen.getByLabelText(t.profile.displayName.label) as HTMLInputElement;
  const brandName = () => screen.getByLabelText(t.profile.brandName.label) as HTMLInputElement;
  const submit = async (state: ProfileState) => {
    action.updateProfile.mockResolvedValueOnce(state);
    await act(async () => {
      fireEvent.submit(displayName().closest('form') as HTMLFormElement);
    });
  };

  it('pola z etykietami nad polem, podpowiedzią i wartościami z profilu', () => {
    renderView();
    expect(displayName().value).toBe('Anna');
    expect(brandName().value).toBe('Kadr Social');
    expect(brandName().name).toBe('brandName');
    expect(brandName().maxLength).toBe(80);
    const hint = document.getElementById(brandName().getAttribute('aria-describedby')!.split(' ')[0]!);
    expect(hint?.textContent).toBe(t.profile.brandName.hint);
    const nameHint = document.getElementById(displayName().getAttribute('aria-describedby')!);
    expect(nameHint?.textContent).toBe(t.profile.displayName.hint);
  });

  it('podpowiedzi mówią prawdę o raporcie: imię zastępuje pustą nazwę, nowa nazwa po zapisie w edytorze', () => {
    // Edytor: autor = nazwa na raporcie albo imię (lib/data/reports.ts, getReportAuthor), zapisywany przy
    // każdym zapisie raportu (saveReport).
    expect(t.profile.displayName.hint).toContain('„Nazwa na raporcie” jest puste');
    expect(t.profile.brandName.hint).toContain('przy następnym zapisie');
  });

  it('„Zapisz” → „Zapisano” w regionie statusu; znika po kolejnej zmianie', async () => {
    renderView();
    fireEvent.change(brandName(), { target: { value: 'Kadr' } });
    await submit({ status: 'success', displayName: 'Anna', brandName: 'Kadr' });
    const sent = action.updateProfile.mock.calls[0]![1];
    expect(sent.get('displayName')).toBe('Anna');
    expect(sent.get('brandName')).toBe('Kadr');
    const status = within(section(t.profile.title)).getByRole('status');
    await waitFor(() => expect(status.textContent).toBe(t.profile.saved));
    expect(screen.getByRole('button', { name: t.profile.submit })).toBeTruthy();
    fireEvent.change(brandName(), { target: { value: 'Kadr S' } });
    expect(status.textContent).toBe('');
  });

  it('błąd pola: komunikat przez aria-describedby, fokus na polu, wpisana wartość zostaje', async () => {
    renderView();
    const long = 'a'.repeat(81);
    await submit({
      status: 'error',
      values: { displayName: 'Anna', brandName: long },
      fieldErrors: { brandName: t.profile.errors.brandNameTooLong },
    });
    await waitFor(() => expect(document.activeElement).toBe(brandName()));
    expect(brandName().getAttribute('aria-invalid')).toBe('true');
    const ids = brandName().getAttribute('aria-describedby')!.split(' ');
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toContain(
      t.profile.errors.brandNameTooLong,
    );
    expect(brandName().value).toBe(long);
  });

  it('błąd zapisu: Alert z przyczyną i naprawą', async () => {
    renderView();
    await submit({
      status: 'error',
      values: { displayName: 'Anna', brandName: 'Kadr' },
      message: t.profile.errors.failed,
    });
    const alert = await within(section(t.profile.title)).findByRole('alert');
    expect(alert.textContent).toContain(t.profile.errorTitle);
    expect(alert.textContent).toContain(t.profile.errors.failed);
  });
});

describe('Ustawienia — logo', () => {
  const chooseFile = async (file: File) => {
    const input = section(t.logo.title).querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
  };

  it('bez logo: krótki tekst i pole wgrywania z typami plików', () => {
    renderView();
    const logo = section(t.logo.title);
    expect(within(logo).getByText(t.logo.none)).toBeTruthy();
    expect(within(logo).queryByRole('img')).toBeNull();
    expect(within(logo).getByText(t.logo.upload.hint)).toBeTruthy();
    expect(within(logo).getByRole('button', { name: t.logo.upload.button })).toBeTruthy();
    const input = logo.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('image/png,image/jpeg,image/webp');
  });

  it('z logo: podgląd z /app/logo z wersją i „Usuń logo”', () => {
    renderView({ hasLogo: true });
    const img = within(section(t.logo.title)).getByRole('img', { name: t.logo.alt });
    expect(img.getAttribute('src')).toBe('/app/logo?v=v1');
    expect(within(section(t.logo.title)).getByRole('button', { name: t.logo.remove })).toBeTruthy();
  });

  it('wstępne sprawdzenie w przeglądarce: pusty, za duży, SVG', () => {
    expect(precheckLogo({ size: 0, type: 'image/png' })).toBe('empty');
    expect(precheckLogo({ size: LOGO_MAX_BYTES + 1, type: 'image/png' })).toBe('tooBig');
    expect(precheckLogo({ size: 10, type: 'image/svg+xml' })).toBe('unsupported');
    expect(precheckLogo({ size: 10, type: 'IMAGE/SVG+XML' })).toBe('unsupported');
    expect(precheckLogo({ size: 10, type: 'application/pdf' })).toBe('unsupported');
    expect(precheckLogo({ size: 10, type: 'image/webp' })).toBeNull();
    expect(precheckLogo({ size: 10, type: '' })).toBeNull();
  });

  it('nietypowy typ poprawnego obrazu (image/pjpeg, image/x-png) idzie do serwera, który sprawdza bajty', () => {
    expect(precheckLogo({ size: 10, type: 'image/pjpeg' })).toBeNull();
    expect(precheckLogo({ size: 10, type: 'image/x-png' })).toBeNull();
    expect(precheckLogo({ size: LOGO_MAX_BYTES, type: 'image/png' })).toBeNull();
  });

  it('za duży plik: przyczyna i naprawa w polu, bez wysyłania', async () => {
    renderView();
    await chooseFile(new File([new Uint8Array(LOGO_MAX_BYTES + 1)], 'logo.png', { type: 'image/png' }));
    expect(action.uploadLogo).not.toHaveBeenCalled();
    const logo = section(t.logo.title);
    expect(within(logo).getByText(t.logo.errors.tooBig.title)).toBeTruthy();
    expect(within(logo).getByRole('alert').textContent).toBe(
      `${t.logo.errors.tooBig.title}. ${t.logo.errors.tooBig.hint}`,
    );
    expect(within(logo).getByRole('button', { name: t.logo.upload.retry })).toBeTruthy();
  });

  it('błąd z serwera (SVG podpisane jako PNG): przyczyna i naprawa', async () => {
    renderView();
    action.uploadLogo.mockResolvedValueOnce({ status: 'error', code: 'unsupported' });
    await chooseFile(new File(['<svg/>'], 'logo.png', { type: 'image/png' }));
    const logo = section(t.logo.title);
    expect(await within(logo).findByText(t.logo.errors.unsupported.title)).toBeTruthy();
    expect(within(logo).getByText(t.logo.errors.unsupported.hint)).toBeTruthy();
    expect(within(logo).getByRole('alert').textContent).toContain(t.logo.errors.unsupported.hint);
  });

  it('„Wgraj logo” → toast „Logo wgrane” i podgląd nowego logo', async () => {
    renderView();
    action.uploadLogo.mockResolvedValueOnce({
      status: 'success',
      result: 'uploaded',
      hasLogo: true,
      version: 'v2',
    });
    const png = new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], 'logo.png', { type: 'image/png' });
    await chooseFile(png);
    await waitFor(() => expect(action.uploadLogo).toHaveBeenCalledTimes(1));
    expect(action.uploadLogo.mock.calls[0]![1].get('logo')).toBe(png);
    const img = await within(section(t.logo.title)).findByRole('img', { name: t.logo.alt });
    expect(img.getAttribute('src')).toBe('/app/logo?v=v2');
    expect(await screen.findByText(t.logo.uploaded)).toBeTruthy();
  });

  it('błąd sesji przy wgrywaniu: Alert z komunikatem', async () => {
    renderView();
    action.uploadLogo.mockResolvedValueOnce({ status: 'error', message: t.logo.errors.session });
    await chooseFile(new File([Uint8Array.from([1])], 'logo.png', { type: 'image/png' }));
    const alert = await within(section(t.logo.title)).findByText(t.logo.errors.session);
    expect(alert.closest('.sd-alert')?.getAttribute('role')).toBe('alert');
  });

  it('„Usuń logo” → toast „Logo usunięte”, podgląd znika, fokus na nagłówku sekcji', async () => {
    renderView({ hasLogo: true });
    action.removeLogo.mockResolvedValueOnce({
      status: 'success',
      result: 'removed',
      hasLogo: false,
      version: 'v3',
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.logo.remove }));
    });
    await waitFor(() => expect(within(section(t.logo.title)).queryByRole('img')).toBeNull());
    expect(await screen.findByText(t.logo.removed)).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: t.logo.title })),
    );
  });
});

describe('Ustawienia — usunięcie konta', () => {
  const open = () =>
    act(() => {
      fireEvent.click(
        within(section(t.deleteAccount.title)).getByRole('button', { name: t.deleteAccount.open }),
      );
    });

  it('okno z ostrzeżeniem, fokus w polu potwierdzenia, Esc zamyka i oddaje fokus', async () => {
    renderView();
    const trigger = within(section(t.deleteAccount.title)).getByRole('button', {
      name: t.deleteAccount.open,
    });
    trigger.focus();
    open();
    const dialog = screen.getByRole('dialog', { name: t.deleteAccount.modal.title });
    expect(dialog.textContent).toContain(t.deleteAccount.modal.body);
    const input = within(dialog).getByLabelText(t.deleteAccount.modal.confirmLabel);
    expect(document.activeElement).toBe(input);
    // Ostrzeżenie opisuje pole, które dostaje fokus — czytnik przeczyta je od razu po otwarciu.
    const described = input.getAttribute('aria-describedby')!.split(' ');
    expect(document.getElementById(described[0]!)?.textContent).toBe(t.deleteAccount.modal.body);
    expect(within(dialog).getByRole('button', { name: t.deleteAccount.modal.submit }).className).toContain(
      'sd-btn--danger',
    );
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('złe słowo: błąd pod polem (aria-describedby), fokus na polu, wpisane słowo zostaje', async () => {
    renderView();
    open();
    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByLabelText(t.deleteAccount.modal.confirmLabel) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'tak' } });
    action.deleteAccount.mockResolvedValueOnce({
      status: 'error',
      fieldError: t.deleteAccount.errors.confirm,
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: t.deleteAccount.modal.submit }));
    });
    expect(action.deleteAccount.mock.calls[0]![1].get('confirm')).toBe('tak');
    await waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'));
    const ids = input.getAttribute('aria-describedby')!.split(' ');
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual([
      t.deleteAccount.modal.body,
      t.deleteAccount.errors.confirm,
    ]);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('tak');
  });

  it('błąd serwera: Alert w oknie, okno zostaje', async () => {
    renderView();
    open();
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(t.deleteAccount.modal.confirmLabel), {
      target: { value: 'usuń' },
    });
    action.deleteAccount.mockResolvedValueOnce({ status: 'error', message: t.deleteAccount.errors.failed });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: t.deleteAccount.modal.submit }));
    });
    expect((await within(dialog).findByRole('alert')).textContent).toContain(t.deleteAccount.errors.failed);
  });

  it('w trakcie usuwania okna nie da się zamknąć: Esc, tło i „Zostaw konto” (aria-disabled z wyjaśnieniem)', async () => {
    renderView();
    open();
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(t.deleteAccount.modal.confirmLabel), {
      target: { value: 'usuń' },
    });
    let finish: (state: DeleteAccountState) => void = () => {};
    action.deleteAccount.mockImplementationOnce(
      () => new Promise<DeleteAccountState>((resolve) => (finish = resolve)),
    );
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: t.deleteAccount.modal.submit }));
    });
    const status = await within(dialog).findByText(t.deleteAccount.modal.pending);
    expect(status.getAttribute('role')).toBe('status');
    const cancel = within(dialog).getByRole('button', { name: t.deleteAccount.modal.cancel });
    expect(cancel.getAttribute('aria-disabled')).toBe('true');
    expect(cancel.getAttribute('aria-describedby')).toBe(status.id);
    expect(
      within(dialog).getByRole('button', { name: t.deleteAccount.modal.submit }).getAttribute('aria-busy'),
    ).toBe('true');

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    act(() => {
      fireEvent.click(cancel);
    });
    act(() => {
      fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    });
    expect(screen.getByRole('dialog')).toBe(dialog);

    // Serwer odpowiedział błędem: okno znów da się zamknąć.
    await act(async () => {
      finish({ status: 'error', message: t.deleteAccount.errors.failed });
    });
    await waitFor(() => expect(cancel.getAttribute('aria-disabled')).toBeNull());
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('„Zostaw konto” zamyka okno bez wywołania akcji', () => {
    renderView();
    open();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: t.deleteAccount.modal.cancel }));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(action.deleteAccount).not.toHaveBeenCalled();
  });
});

describe('Strona /app/ustawienia', () => {
  it('AppShell z bieżącą sekcją i plakietką planu; dane z sesji', async () => {
    data.requireUser.mockResolvedValue({ id: 'u1', email: 'anna@example.com' });
    data.getProfile.mockResolvedValue(PROFILE);
    render(<ToastProvider>{await SettingsPage()}</ToastProvider>);
    expect(data.requireUser).toHaveBeenCalledWith('/app/ustawienia');
    expect(data.getProfile).toHaveBeenCalledWith(data.db);
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getAllByText('Na start').some((el) => el.className.includes('sd-badge--plan'))).toBe(true);
    for (const link of screen.getAllByRole('link', { name: 'Ustawienia' }))
      expect(link.getAttribute('aria-current')).toBe('page');
    expect(metadata.title).toBe(t.meta.title);
  });

  it('błąd bazy: Alert z przyczyną i naprawą, bez szczegółów w logu', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    data.requireUser.mockResolvedValue({ id: 'u1', email: 'anna@example.com' });
    data.getProfile.mockRejectedValue(new Error('Kadr Social secret'));
    render(<ToastProvider>{await SettingsPage()}</ToastProvider>);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(t.loadError.title);
    expect(within(alert).getByRole('link', { name: t.loadError.retry }).getAttribute('href')).toBe(
      '/app/ustawienia',
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    log.mockRestore();
  });
});

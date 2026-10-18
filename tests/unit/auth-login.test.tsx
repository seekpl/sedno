// @vitest-environment jsdom
/**
 * /logowanie (PROMPT.md §10, §14, §15): etykieta nad polem, pole e-mail z właściwymi atrybutami, ukryte ?next=
 * po safeNextPath, ?blad=link, linia prawna, przejście do „Sprawdź skrzynkę” z tekstem auth.checkInbox,
 * „Wyślij ponownie” i „Użyj innego adresu”, fokus po zmianie widoku i po błędzie pola. Bez flagi kont 404.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoginState } from '@/app/logowanie/actions';
import { auth as t } from '@/lib/copy/auth';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const flags = vi.hoisted(() => ({ accounts: true }));
vi.mock('@/config/features', () => ({
  features: {
    get accounts() {
      return flags.accounts;
    },
  },
}));

const action = vi.hoisted(() => ({ requestMagicLink: vi.fn() }));
vi.mock('@/app/logowanie/actions', () => action);

const { LoginPanel } = await import('@/components/auth/LoginPanel');
const { default: LoginPage, metadata } = await import('@/app/logowanie/page');

/** Ostatnie wywołanie akcji: pola formularza (z przyciskiem, który go wysłał). */
function lastFormData(): Record<string, string> {
  const calls = action.requestMagicLink.mock.calls;
  const data = calls[calls.length - 1]?.[1] as FormData;
  return Object.fromEntries([...data.entries()].map(([k, v]) => [k, String(v)]));
}

async function submitEmail(email: string) {
  fireEvent.change(screen.getByLabelText(t.form.email.label), { target: { value: email } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: t.form.submit }));
  });
}

beforeEach(() => {
  flags.accounts = true;
  action.requestMagicLink.mockReset();
});

afterEach(cleanup);

describe('LoginPanel — formularz', () => {
  it('nagłówek, pole e-mail z etykietą i atrybutami, ukryte next, linia prawna', () => {
    render(<LoginPanel next="/app/raporty?strona=2" />);
    screen.getByRole('heading', { level: 1, name: t.form.title });
    const input = screen.getByLabelText(t.form.email.label) as HTMLInputElement;
    expect(input.type).toBe('email');
    expect(input.getAttribute('autocomplete')).toBe('email');
    expect(input.getAttribute('inputmode')).toBe('email');
    expect(input.required).toBe(true);
    const form = screen.getByRole('form', { name: t.form.label });
    expect((form.querySelector('input[name="next"]') as HTMLInputElement).value).toBe(
      '/app/raporty?strona=2',
    );
    expect(screen.getByRole('link', { name: t.form.legal.terms }).getAttribute('href')).toBe('/regulamin');
    expect(screen.getByRole('link', { name: t.form.legal.privacy }).getAttribute('href')).toBe('/prywatnosc');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('?blad=link: komunikat o niedziałającym linku z naprawą', () => {
    render(<LoginPanel next="/app/klienci" linkError />);
    const alert = screen.getByRole('alert');
    within(alert).getByText(t.linkError.title);
    within(alert).getByText(t.linkError.body);
  });

  it('?blad=link: opis błędu z Supabase w części „#” adresu znika z paska adresu, komunikat zostaje', () => {
    window.history.replaceState(null, '', '/logowanie?blad=link#error=access_denied&error_code=otp_expired');
    render(<LoginPanel next="/app/klienci" linkError />);
    expect(window.location.hash).toBe('');
    expect(`${window.location.pathname}${window.location.search}`).toBe('/logowanie?blad=link');
    within(screen.getByRole('alert')).getByText(t.linkError.title);
  });

  it('?blad=link: komunikat znika po pierwszym działaniu i nie wraca po „Użyj innego adresu”', async () => {
    action.requestMagicLink.mockResolvedValueOnce({ status: 'sent', email: 'ala@firma.pl' });
    render(<LoginPanel next="/app/klienci" linkError />);
    await submitEmail('ala@firma.pl');
    await screen.findByRole('heading', { name: t.checkInbox.title });
    action.requestMagicLink.mockResolvedValueOnce({ status: 'idle' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.checkInbox.change }));
    });
    await screen.findByRole('heading', { name: t.form.title });
    expect(screen.queryByText(t.linkError.title)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('wysłanie → „Sprawdź skrzynkę” z adresem, fokus na nagłówku', async () => {
    action.requestMagicLink.mockResolvedValue({ status: 'sent', email: 'ala@firma.pl' } satisfies LoginState);
    render(<LoginPanel next="/app/klienci" linkError />);
    await submitEmail('ala@firma.pl');

    expect(lastFormData()).toMatchObject({ email: 'ala@firma.pl', intent: 'send', next: '/app/klienci' });
    const heading = await screen.findByRole('heading', { level: 1, name: t.checkInbox.title });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    screen.getByText(
      'Wysłaliśmy link na ala@firma.pl. Otwórz go na tym urządzeniu. Link działa przez godzinę.',
    );
    screen.getByText(t.checkInbox.spam);
    // Po wysłaniu komunikat o starym linku znika.
    expect(screen.queryByText(t.linkError.title)).toBeNull();
    screen.getByRole('button', { name: t.checkInbox.resend });
    screen.getByRole('button', { name: t.checkInbox.change });
  });

  it('błąd pola: aria-invalid, opis przez aria-describedby, fokus na polu, wpisany adres zostaje', async () => {
    action.requestMagicLink.mockResolvedValue({
      status: 'idle',
      email: 'ala@',
      fieldError: t.errors.emailInvalid,
    } satisfies LoginState);
    render(<LoginPanel next="/app/klienci" />);
    await submitEmail('ala@');

    const input = screen.getByLabelText(t.form.email.label) as HTMLInputElement;
    await waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'));
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)?.textContent).toBe(t.errors.emailInvalid);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('ala@');
  });

  it('limit: komunikat z przyczyną i naprawą (role=alert), formularz zostaje', async () => {
    action.requestMagicLink.mockResolvedValue({
      status: 'idle',
      email: 'ala@firma.pl',
      message: t.errors.rateLimitedIp,
    } satisfies LoginState);
    render(<LoginPanel next="/app/klienci" />);
    await submitEmail('ala@firma.pl');
    const alert = await screen.findByRole('alert');
    within(alert).getByText(t.error.title);
    within(alert).getByText(t.errors.rateLimitedIp);
    screen.getByRole('button', { name: t.form.submit });
  });
});

describe('LoginPanel — „Sprawdź skrzynkę”', () => {
  async function renderSent() {
    action.requestMagicLink.mockResolvedValueOnce({ status: 'sent', email: 'ala@firma.pl' });
    render(<LoginPanel next="/app/klienci" />);
    await submitEmail('ala@firma.pl');
    await screen.findByRole('heading', { name: t.checkInbox.title });
  }

  it('„Wyślij ponownie” wysyła ten sam adres i pokazuje wynik słowem i ikoną w stałym regionie status', async () => {
    await renderSent();
    // Region istnieje, zanim pojawi się wynik (czytniki ekranu ogłaszają zmiany w istniejącym regionie).
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');
    action.requestMagicLink.mockResolvedValueOnce({ status: 'sent', email: 'ala@firma.pl', resent: true });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.checkInbox.resend }));
    });
    expect(lastFormData()).toMatchObject({ email: 'ala@firma.pl', intent: 'resend', next: '/app/klienci' });
    await within(status).findByText(t.checkInbox.resent);
    expect(status.querySelector('svg')).not.toBeNull();
  });

  it('drugie „Wyślij ponownie”: w trakcie wynik znika, potem wraca jako nowy węzeł (ponowne ogłoszenie)', async () => {
    await renderSent();
    action.requestMagicLink.mockResolvedValueOnce({ status: 'sent', email: 'ala@firma.pl', resent: true });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.checkInbox.resend }));
    });
    const status = screen.getByRole('status');
    const first = await within(status).findByText(t.checkInbox.resent);

    let finish: (state: LoginState) => void = () => {};
    action.requestMagicLink.mockReturnValueOnce(new Promise<LoginState>((resolve) => (finish = resolve)));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.checkInbox.resend }));
    });
    expect(status.textContent).toBe('');
    expect(screen.getByRole('button', { name: t.checkInbox.resend }).getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('button', { name: t.checkInbox.change }).getAttribute('aria-busy')).toBeNull();
    await act(async () => finish({ status: 'sent', email: 'ala@firma.pl', resent: true }));
    const second = await within(status).findByText(t.checkInbox.resent);
    expect(second).not.toBe(first);
  });

  it('„Użyj innego adresu” w trakcie pokazuje zajętość tylko na sobie', async () => {
    await renderSent();
    let finish: (state: LoginState) => void = () => {};
    action.requestMagicLink.mockReturnValueOnce(new Promise<LoginState>((resolve) => (finish = resolve)));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.checkInbox.change }));
    });
    expect(screen.getByRole('button', { name: t.checkInbox.change }).getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('button', { name: t.checkInbox.resend }).getAttribute('aria-busy')).toBeNull();
    await act(async () => finish({ status: 'idle' }));
    await screen.findByRole('heading', { name: t.form.title });
  });

  it('błąd przy ponownym wysłaniu zostaje na tym ekranie', async () => {
    await renderSent();
    action.requestMagicLink.mockResolvedValueOnce({
      status: 'sent',
      email: 'ala@firma.pl',
      message: t.errors.providerRateLimited,
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.checkInbox.resend }));
    });
    within(await screen.findByRole('alert')).getByText(t.errors.providerRateLimited);
    screen.getByRole('heading', { name: t.checkInbox.title });
  });

  it('„Użyj innego adresu” wraca do pustego formularza z fokusem na polu', async () => {
    await renderSent();
    action.requestMagicLink.mockResolvedValueOnce({ status: 'idle' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.checkInbox.change }));
    });
    expect(lastFormData()).toMatchObject({ intent: 'change' });
    const input = (await screen.findByLabelText(t.form.email.label)) as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(input.value).toBe('');
  });
});

describe('/logowanie (strona)', () => {
  async function renderPage(params: Record<string, string | string[] | undefined>) {
    const element = await LoginPage({ searchParams: Promise.resolve(params) });
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(element);
    document.body.replaceChildren(container);
    return container;
  }

  it('jasny motyw, logo z linkiem do strony głównej, h1 i formularz; next po safeNextPath', async () => {
    const root = await renderPage({ next: 'https://zly.example/app' });
    expect(root.querySelector('[data-theme="light"]')).not.toBeNull();
    const home = root.querySelector('a[href="/"]');
    expect(home?.getAttribute('aria-label')).toBe('Sedno, strona główna');
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelector('main#tresc')).not.toBeNull();
    expect((root.querySelector('input[name="next"]') as HTMLInputElement).value).toBe('/app/klienci');
    expect(root.textContent).not.toContain(t.linkError.title);
  });

  it('?next= z /app zostaje, ?blad=link pokazuje błąd linku', async () => {
    const root = await renderPage({ next: '/app/klienci/abc/2026-09', blad: 'link' });
    expect((root.querySelector('input[name="next"]') as HTMLInputElement).value).toBe(
      '/app/klienci/abc/2026-09',
    );
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(t.linkError.title);
  });

  it('metadane: tytuł i noindex', () => {
    expect(metadata.title).toBe(t.meta.title);
    expect(metadata.robots).toMatchObject({ index: false });
  });

  it('bez flagi kont 404', async () => {
    flags.accounts = false;
    await expect(LoginPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

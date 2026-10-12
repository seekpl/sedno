// @vitest-environment jsdom
/**
 * Formularz listy oczekujących: etykiety nad polami, błędy przez aria-describedby, wymagana zgoda,
 * link do polityki prywatności, ukryte pola planu i sesji, stany błędu i sukcesu.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitlist as t } from '@/lib/copy/waitlist';

const ANON = 'AbCdEfGhIjKlMnOpQrStUv';

type State = {
  status: 'idle' | 'success' | 'error';
  fieldErrors?: { email?: string; consent?: string };
  message?: string;
  email?: string;
  consent?: boolean;
};

const action = vi.hoisted(() => ({ joinWaitlist: vi.fn<(prev: State, data: FormData) => Promise<State>>() }));
vi.mock('@/app/actions/waitlist', () => ({ joinWaitlist: action.joinWaitlist }));
vi.mock('@/lib/analytics/client', () => ({ getAnonId: () => ANON, track: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { WaitlistForm } = await import('@/components/site/WaitlistForm');

beforeEach(() => {
  action.joinWaitlist.mockReset();
});

afterEach(cleanup);

function emailInput() {
  return screen.getByLabelText(t.email.label) as HTMLInputElement;
}

function consentBox() {
  return screen.getByRole('checkbox') as HTMLInputElement;
}

function submitButton() {
  return screen.getByRole('button', { name: t.submit });
}

function form() {
  return screen.getByRole('form', { name: t.formLabel('Solo') }) as HTMLFormElement;
}

async function submitWith(state: State) {
  action.joinWaitlist.mockResolvedValueOnce(state);
  await act(async () => {
    fireEvent.submit(form());
  });
}

describe('WaitlistForm — struktura i dostępność', () => {
  it('pole e-mail z etykietą nad polem, autouzupełnianiem i typem email', () => {
    render(<WaitlistForm plan="solo" />);
    const input = emailInput();
    expect(input.type).toBe('email');
    expect(input.name).toBe('email');
    expect(input.autocomplete).toBe('email');
    expect(input.required).toBe(true);
    const label = document.querySelector(`label[for="${input.id}"]`);
    expect(label?.textContent).toBe(t.email.label);
    // Etykieta przed polem w kolejności dokumentu (nad polem).
    expect(label!.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(input.getAttribute('aria-describedby')).toBeNull();
  });

  it('zgoda: wymagane pole wyboru z etykietą o jednej wiadomości i linkiem do polityki prywatności', () => {
    render(<WaitlistForm plan="solo" />);
    const box = consentBox();
    expect(box.name).toBe('consent');
    expect(box.required).toBe(true);
    expect(box.checked).toBe(false);
    const label = document.querySelector(`label[for="${box.id}"]`)!;
    expect(label.contains(box)).toBe(true);
    expect(label.textContent).toBe(`${t.consent.before('Solo')}${t.consent.link}${t.consent.after}`);
    expect(label.textContent).toContain('jedną wiadomość e-mail o starcie planu Solo');
    const link = screen.getByRole('link', { name: t.consent.link });
    expect(link.getAttribute('href')).toBe('/prywatnosc');
    expect(link.className).toContain('sd-link');
    expect(label.contains(link)).toBe(true);
  });

  it('ukryte pola: plan i identyfikator sesji (bez cookies)', () => {
    render(<WaitlistForm plan="studio" />);
    const f = screen.getByRole('form', { name: t.formLabel('Studio') });
    expect((f.querySelector('input[name="plan"]') as HTMLInputElement).value).toBe('studio');
    expect((f.querySelector('input[name="anonId"]') as HTMLInputElement).value).toBe(ANON);
    expect(document.cookie).toBe('');
  });

  it('przycisk wysyłający z tekstem z lib/copy/waitlist.ts', () => {
    render(<WaitlistForm plan="solo" />);
    expect(submitButton().getAttribute('type')).toBe('submit');
    expect(submitButton().className).toContain('sd-btn--primary');
  });
});

describe('WaitlistForm — wysyłka', () => {
  it('wysyła e-mail, zgodę, plan i identyfikator sesji', async () => {
    render(<WaitlistForm plan="solo" />);
    fireEvent.change(emailInput(), { target: { value: 'ala@firma.pl' } });
    fireEvent.click(consentBox());
    await submitWith({ status: 'success' });
    expect(action.joinWaitlist).toHaveBeenCalledOnce();
    const data = action.joinWaitlist.mock.calls[0]![1];
    expect(Object.fromEntries(data)).toMatchObject({
      email: 'ala@firma.pl',
      consent: 'on',
      plan: 'solo',
      anonId: ANON,
    });
  });

  it('bez zaznaczonej zgody przeglądarka nie wysyła formularza (pole wymagane)', async () => {
    render(<WaitlistForm plan="solo" />);
    fireEvent.change(emailInput(), { target: { value: 'ala@firma.pl' } });
    expect(form().checkValidity()).toBe(false);
    expect(consentBox().validity.valueMissing).toBe(true);
    fireEvent.click(consentBox());
    expect(form().checkValidity()).toBe(true);
  });

  it('błędy pól: opis przez aria-describedby, aria-invalid, fokus na pierwszym złym polu', async () => {
    render(<WaitlistForm plan="solo" />);
    await submitWith({
      status: 'error',
      fieldErrors: { email: t.errors.emailInvalid, consent: t.errors.consentRequired },
      email: 'ala@',
      consent: false,
    });

    const input = emailInput();
    await waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'));
    const emailErrorId = input.getAttribute('aria-describedby')!;
    expect(document.getElementById(emailErrorId)?.textContent).toBe(t.errors.emailInvalid);
    expect(input.value).toBe('ala@');

    const box = consentBox();
    expect(box.getAttribute('aria-invalid')).toBe('true');
    const consentErrorId = box.getAttribute('aria-describedby')!;
    expect(document.getElementById(consentErrorId)?.textContent).toBe(t.errors.consentRequired);
    expect(consentErrorId).not.toBe(emailErrorId);

    expect(document.activeElement).toBe(input);
  });

  it('sam błąd zgody: fokus na polu wyboru, adres zostaje', async () => {
    render(<WaitlistForm plan="solo" />);
    await submitWith({
      status: 'error',
      fieldErrors: { consent: t.errors.consentRequired },
      email: 'ala@firma.pl',
      consent: false,
    });
    await waitFor(() => expect(document.activeElement).toBe(consentBox()));
    expect(emailInput().value).toBe('ala@firma.pl');
    expect(emailInput().getAttribute('aria-describedby')).toBeNull();
  });

  it('błąd ogólny: komunikat z ikoną i słowem (role=alert), formularz zostaje', async () => {
    render(<WaitlistForm plan="solo" />);
    await submitWith({
      status: 'error',
      message: t.errors.unavailable,
      email: 'ala@firma.pl',
      consent: true,
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(t.error.title);
    expect(alert.textContent).toContain(t.errors.unavailable);
    expect(alert.querySelector('svg')).not.toBeNull();
    expect(submitButton()).toBeTruthy();
    expect(consentBox().checked).toBe(true);
  });

  it('sukces: komunikat role=status zastępuje formularz i dostaje fokus', async () => {
    render(<WaitlistForm plan="solo" />);
    await submitWith({ status: 'success' });
    const status = await screen.findByRole('status');
    expect(status.textContent).toContain(t.success.title);
    expect(status.textContent).toContain(t.success.body('Solo'));
    expect(screen.queryByRole('form')).toBeNull();
    expect(document.activeElement?.contains(status)).toBe(true);
  });

  it('w trakcie wysyłki przycisk jest zajęty (aria-busy) i ignoruje kliknięcia', async () => {
    let resolve: (s: State) => void = () => {};
    action.joinWaitlist.mockImplementationOnce(() => new Promise<State>((r) => (resolve = r)));
    render(<WaitlistForm plan="solo" />);
    await act(async () => {
      fireEvent.submit(form());
    });
    await waitFor(() => expect(submitButton().getAttribute('aria-busy')).toBe('true'));
    await act(async () => {
      resolve({ status: 'success' });
    });
    expect(await screen.findByRole('status')).toBeTruthy();
  });
});

// @vitest-environment jsdom
/**
 * „Powiadom mnie o starcie” bez JavaScriptu (PROMPT.md §12, docs/decisions.md p. 18). Formularz wysyła się
 * zwykłym POST, a strona wraca z zamkniętym <details>, więc bez reguły w NotifyDisclosure.module.css komunikat
 * „Zapisano na listę” albo błąd byłby ukryty. Reguła pokazuje treść zamkniętego <details>, gdy w środku jest
 * element z wymienionymi klasami. Test pilnuje kontraktu: WaitlistForm renderuje te klasy w stanach sukcesu
 * i błędu, a w stanie początkowym nie (inaczej formularze byłyby zawsze rozwinięte).
 * Stany wywołujemy prawdziwym wysłaniem formularza (akcja zwraca wynik), z <details> cały czas zamkniętym.
 * Zachowanie w przeglądarce (::details-content) sprawdza e2e „lista oczekujących bez JavaScriptu”.
 */
import fs from 'node:fs';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WaitlistState } from '@/app/actions/waitlist';
import { landing } from '@/lib/copy/landing';
import { waitlist } from '@/lib/copy/waitlist';

const action = vi.hoisted(() => ({
  joinWaitlist: vi.fn<(prev: WaitlistState, data: FormData) => Promise<WaitlistState>>(),
}));
vi.mock('@/app/actions/waitlist', () => ({ joinWaitlist: action.joinWaitlist }));
vi.mock('@/lib/analytics/client', () => ({ getAnonId: () => '', track: vi.fn() }));

const { NotifyDisclosure } = await import('@/components/site/NotifyDisclosure');

const CSS = fs.readFileSync('components/site/NotifyDisclosure.module.css', 'utf8');

/** Klasy globalne z :has() reguły, która odsłania treść zamkniętego <details> (::details-content). */
function revealSelector(): string {
  const rule = /\.disclosure:has\(([^{]+)\)::details-content\s*\{([^}]*)\}/.exec(CSS);
  if (!rule) throw new Error('Brak reguły .disclosure:has(…)::details-content');
  expect(rule[2]).toMatch(/content-visibility:\s*visible/);
  const classes = [...rule[1]!.matchAll(/:global\(\.([\w-]+)\)/g)].map((m) => m[1]!);
  expect(classes.length).toBeGreaterThan(0);
  return classes.map((c) => `.${c}`).join(', ');
}

function detailsOf(container: HTMLElement): HTMLDetailsElement {
  const details = container.querySelector('details');
  if (!details) throw new Error('Brak <details>');
  return details;
}

beforeEach(() => {
  action.joinWaitlist.mockReset();
});

afterEach(cleanup);

describe('„Powiadom mnie o starcie” bez JavaScriptu', () => {
  it('HTML z serwera: zamknięty <details> z <summary> jak przycisk i formularzem; reguła go nie dotyczy', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(<NotifyDisclosure plan="solo" />);
    const details = detailsOf(container);
    expect(details.open).toBe(false);
    const summary = details.querySelector(':scope > summary');
    expect(summary?.textContent).toBe(landing.pricing.notify);
    expect(summary?.className).toContain('sd-btn');
    expect(details.querySelector('form')).not.toBeNull();
    expect(details.querySelector(revealSelector())).toBeNull();
  });

  it.each<[string, WaitlistState, string]>([
    ['sukces', { status: 'success' }, waitlist.success.title],
    [
      'błąd adresu',
      { status: 'error', fieldErrors: { email: waitlist.errors.emailRequired } },
      waitlist.errors.emailRequired,
    ],
    [
      'brak zgody',
      { status: 'error', fieldErrors: { consent: waitlist.errors.consentRequired } },
      waitlist.errors.consentRequired,
    ],
    ['błąd serwera', { status: 'error', message: waitlist.errors.failed }, waitlist.errors.failed],
  ])('%s: wynik w zamkniętym <details> pasuje do reguły odsłaniania', async (_, state, text) => {
    const { container } = render(<NotifyDisclosure plan="solo" />);
    const details = detailsOf(container);
    expect(details.querySelector(revealSelector())).toBeNull();

    action.joinWaitlist.mockResolvedValueOnce(state);
    await act(async () => {
      fireEvent.submit(details.querySelector('form')!);
    });

    expect(action.joinWaitlist).toHaveBeenCalledTimes(1);
    // Po POST bez JavaScriptu strona wraca z zamkniętym <details> — widoczność daje tylko CSS.
    expect(details.open).toBe(false);
    expect(details.textContent).toContain(text);
    expect(details.querySelector(revealSelector())).not.toBeNull();
  });
});

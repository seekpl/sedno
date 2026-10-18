// @vitest-environment jsdom
/**
 * Krok 3 /nowy (components/tool/PreviewStep.tsx) a konta (config/features.ts): bez kont informacja „Wkrótce”
 * o linku i historii w planie Solo, z kontami — prawda o koncie i zwykły link do logowania (bez next/link,
 * bo /logowanie ma własną CSP z nonce — docs/decisions.md, p. 64). Nic nie jest „Wkrótce”, gdy już działa.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLE_REPORT } from '@/lib/report/example';

const flags = vi.hoisted(() => ({ features: { accounts: false, payments: false } }));
vi.mock('@/config/features', () => flags);

const { PreviewStep } = await import('@/components/tool/PreviewStep');

function renderPreview() {
  return render(
    <PreviewStep
      headingId="h"
      report={EXAMPLE_REPORT}
      clientName="Studio Lumi"
      pdf={{ status: 'idle' }}
      isPhone={false}
      onDownload={() => {}}
      onRequestClient={() => {}}
      onBack={() => {}}
    />,
  );
}

afterEach(() => {
  cleanup();
  flags.features.accounts = false;
});

describe('PreviewStep: informacja o koncie', () => {
  it('bez kont: „Wkrótce” i link oraz historia w planie Solo, bez linku do logowania', () => {
    renderPreview();
    expect(screen.getByText('Wkrótce')).toBeTruthy();
    expect(screen.getByText('Link do raportu i historia raportów będą w planie Solo.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Zaloguj się' })).toBeNull();
  });

  it('z kontami: bez „Wkrótce”, informacja, że raport się nie zapisze, i zwykły link do logowania', () => {
    flags.features.accounts = true;
    renderPreview();
    expect(screen.queryByText('Wkrótce')).toBeNull();
    expect(screen.queryByText(/będą w planie Solo/)).toBeNull();
    expect(
      screen.getByText(
        'Link do raportu i historia raportów są w koncie. Ten raport się nie zapisze, więc najpierw pobierz PDF.',
      ),
    ).toBeTruthy();
    const login = screen.getByRole('link', { name: 'Zaloguj się' });
    expect(login.getAttribute('href')).toBe('/logowanie');
    expect(login.className).toContain('sd-link');
  });
});

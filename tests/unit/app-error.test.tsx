// @vitest-environment jsdom
/**
 * Granica błędu obszaru konta (app/app/error.tsx): pasek aplikacji zostaje, h1 dostaje fokus, komunikat
 * mówi przyczynę i naprawę (role="alert"), „Wczytaj ponownie” wywołuje retry() z Next.js.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AccountError from '@/app/app/error';
import { app as t } from '@/lib/copy/app';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/app' }));

afterEach(cleanup);

describe('błąd w obszarze konta', () => {
  it('pokazuje nawigację, nagłówek z fokusem i komunikat z naprawą', () => {
    const retry = vi.fn();
    render(<AccountError error={new Error('ECONNRESET')} retry={retry} />);
    expect(screen.getAllByRole('link', { name: 'Klienci' }).length).toBeGreaterThan(0);
    const heading = screen.getByRole('heading', { level: 1, name: t.error.heading });
    expect(document.activeElement).toBe(heading);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(t.error.title);
    expect(alert.textContent).toContain(t.error.body);
    expect(document.body.textContent).not.toContain('ECONNRESET');
    fireEvent.click(screen.getByRole('button', { name: t.error.retry }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe('brak zasobu w obszarze konta', () => {
  it('pokazuje nawigację, nagłówek i link do klientów, bez szczegółów', async () => {
    const { default: AccountNotFound } = await import('@/app/app/not-found');
    render(<AccountNotFound />);
    expect(screen.getByRole('heading', { level: 1, name: t.notFound.heading })).toBeTruthy();
    expect(screen.getByRole('link', { name: t.notFound.back }).getAttribute('href')).toBe('/app/klienci');
  });
});

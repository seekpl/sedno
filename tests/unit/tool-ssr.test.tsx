/**
 * /nowy renderuje się na serwerze (bez window, localStorage i matchMedia): krok 1 w wersji telefonu
 * (mobile-first), z linią prywatności i bez żadnych danych z przeglądarki.
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { NewReportFlow } from '@/components/tool/NewReportFlow';
import { ToastProvider } from '@/components/ui/Toast';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/analytics/client', () => ({ track: vi.fn() }));

describe('/nowy na serwerze', () => {
  it('renderuje krok 1 bez API przeglądarki', () => {
    expect(typeof window).toBe('undefined');
    const html = renderToString(
      <ToastProvider>
        <NewReportFlow initialMonth="2026-09" maxMonth="2026-10" />
      </ToastProvider>,
    );
    expect(html).toContain('Wgraj eksport za wrzesień');
    expect(html).toContain('Krok 1 z 3');
    expect(html).toContain('Plik zostaje w Twojej przeglądarce. Nie wysyłamy go na serwer.');
    expect(html).toContain('Wrzesień 2026');
    // Mobile-first: na serwerze przycisk wyboru pliku ma 48 px i całą szerokość.
    expect(html).toMatch(/class="sd-btn sd-btn--primary sd-btn--l sd-btn--block"[^>]*>[^<]*Wybierz plik/);
    expect(html).toContain('accept=".csv,text/csv"');
    expect(html).not.toContain('<script');
  });
});

// @vitest-environment jsdom
/**
 * Historia raportów w przeglądarce (jsdom): tabela i karty telefonu (klient, miesiąc, status słowem
 * i ikoną, data wysłania albo „—”, stan linku słowem i ikoną, „Otwórz” z nazwą klienta i miesiąca),
 * paginacja po 20, pusty stan (empty.history) i strona z ?strona= (przekierowania, błąd bazy).
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { history as t } from '@/lib/copy/history';
import type { HistoryPage, HistoryRow } from '@/lib/data/history';

vi.mock('server-only', () => ({}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}

const nav = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: nav.redirect, useRouter: () => ({ push: vi.fn() }) }));

const data = vi.hoisted(() => ({
  listReports: vi.fn(),
  getPlan: vi.fn(),
  db: { marker: 'db' },
}));
vi.mock('@/lib/data/history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data/history')>()),
  listReports: data.listReports,
}));
vi.mock('@/lib/data/profile', () => ({ getPlan: data.getPlan }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => data.db }));

const { HistoryView } = await import('@/components/app/history/HistoryView');
const { default: HistoryPageRoute, generateMetadata } = await import('@/app/app/raporty/page');

const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const ROWS: HistoryRow[] = [
  {
    id: ID(1),
    clientId: ID(5),
    clientName: 'Studio Lumi',
    month: '2026-09',
    status: 'sent',
    sentAt: '2026-09-27T10:00:00Z',
    link: 'active',
  },
  {
    id: ID(2),
    clientId: ID(6),
    clientName: 'Bistro Pod Lipą',
    month: '2026-09',
    status: 'ready',
    sentAt: null,
    link: 'none',
  },
  {
    id: ID(3),
    clientId: ID(5),
    clientName: 'Studio Lumi',
    month: '2026-08',
    status: 'draft',
    sentAt: null,
    link: 'revoked',
  },
  {
    id: ID(4),
    clientId: ID(6),
    clientName: 'Bistro Pod Lipą',
    month: '2025-08',
    status: 'sent',
    sentAt: '2025-09-01T08:00:00Z',
    link: 'expired',
  },
];

const PAGE: HistoryPage = { rows: ROWS, total: 4, page: 1, pageCount: 1 };

const table = () => screen.getByRole('table', { name: t.table.caption });
const cards = () => screen.getByRole('list', { name: t.table.caption });

beforeEach(() => {
  nav.redirect.mockReset().mockImplementation((url: string) => {
    throw new RedirectError(url);
  });
  data.listReports.mockReset();
  data.getPlan.mockReset().mockResolvedValue('free');
});

afterEach(cleanup);

describe('HistoryView — tabela', () => {
  it('nagłówki kolumn i liczba raportów z odmianą', () => {
    render(<HistoryView data={PAGE} />);
    expect(screen.getByRole('heading', { level: 1, name: t.heading })).toBeTruthy();
    expect(screen.getByText(t.lead(4))).toBeTruthy();
    const headers = within(table())
      .getAllByRole('columnheader')
      .map((th) => th.textContent);
    expect(headers).toEqual([
      t.table.client,
      t.table.month,
      t.table.status,
      t.table.sent,
      t.table.link,
      t.table.actions,
    ]);
  });

  it('wiersz: klient, miesiąc, status słowem i ikoną, data wysłania, link, „Otwórz”', () => {
    render(<HistoryView data={PAGE} />);
    const [, first] = within(table()).getAllByRole('row');
    const cells = within(first!).getAllByRole('cell');
    expect(cells[0]!.textContent).toBe('SLStudio Lumi');
    expect(cells[1]!.textContent).toBe('Wrzesień 2026');
    expect(cells[1]!.querySelector('.sd-num')).toBeTruthy();
    const badge = cells[2]!.querySelector('.sd-badge')!;
    expect(badge.textContent).toBe('Wysłany');
    expect(badge.querySelector('svg')).toBeTruthy();
    expect(cells[3]!.textContent).toBe('27 września 2026');
    expect(cells[4]!.textContent).toBe(t.link.active);
    expect(cells[4]!.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
    const open = within(cells[5]!).getByRole('link');
    expect(open.textContent).toBe(`${t.open.label} raport: Studio Lumi, wrzesień 2026`);
    expect(open.getAttribute('href')).toBe(`/app/klienci/${ID(5)}/2026-09`);
  });

  it('brak daty wysłania i brak linku: „—” i słowo dla czytników, nigdy 0', () => {
    render(<HistoryView data={PAGE} />);
    const second = within(table()).getAllByRole('row')[2]!;
    const cells = within(second).getAllByRole('cell');
    expect(cells[3]!.querySelector('[aria-hidden="true"]')?.textContent).toBe('—');
    expect(cells[3]!.querySelector('.sd-visually-hidden')?.textContent).toBe(t.notSent);
    expect(cells[4]!.querySelector('[aria-hidden="true"]')?.textContent).toBe('—');
    expect(cells[4]!.querySelector('.sd-visually-hidden')?.textContent).toBe(t.noLink);
  });

  it('stany linku: Aktywny, Wyłączony, Wygasł — słowem i ikoną', () => {
    render(<HistoryView data={PAGE} />);
    const linkCells = within(table())
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[4]!);
    expect(linkCells.map((c) => c.textContent)).toEqual([
      t.link.active,
      `—${t.noLink}`,
      t.link.revoked,
      t.link.expired,
    ]);
    for (const cell of [linkCells[0]!, linkCells[2]!, linkCells[3]!])
      expect(cell.querySelector('svg')).toBeTruthy();
  });

  it('statusy z plakietek: Szkic, Gotowy, Wysłany', () => {
    render(<HistoryView data={PAGE} />);
    const statuses = within(table())
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[2]!.textContent);
    expect(statuses).toEqual(['Wysłany', 'Gotowy', 'Szkic', 'Wysłany']);
  });

  it('karty na telefonie z tymi samymi danymi i działaniem', () => {
    render(<HistoryView data={PAGE} />);
    const items = within(cards()).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[1]!.textContent).toContain('Bistro Pod Lipą');
    expect(within(items[1]!).getByRole('link').getAttribute('href')).toBe(`/app/klienci/${ID(6)}/2026-09`);
  });

  it('paginacja po 20: bieżąca strona i linki do pozostałych', () => {
    render(<HistoryView data={{ rows: ROWS, total: 45, page: 2, pageCount: 3 }} />);
    const nav = screen.getByRole('navigation', { name: t.pagination });
    expect(within(nav).getByText('2').getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: '1' }).getAttribute('href')).toBe('/app/raporty');
    expect(within(nav).getByRole('link', { name: '3' }).getAttribute('href')).toBe('/app/raporty?strona=3');
    expect(within(nav).getByRole('link', { name: 'Następna strona' }).getAttribute('href')).toBe(
      '/app/raporty?strona=3',
    );
  });

  it('jedna strona: bez paginacji', () => {
    render(<HistoryView data={PAGE} />);
    expect(screen.queryByRole('navigation', { name: t.pagination })).toBeNull();
  });

  it('pusty stan: empty.history i droga do klientów', () => {
    render(<HistoryView data={{ rows: [], total: 0, page: 1, pageCount: 1 }} />);
    expect(screen.getByRole('heading', { level: 2, name: t.empty.title })).toBeTruthy();
    expect(screen.getByText(t.empty.body)).toBeTruthy();
    expect(screen.getByRole('link', { name: t.empty.action }).getAttribute('href')).toBe('/app/klienci');
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('Strona /app/raporty', () => {
  const renderPage = async (strona?: string | string[]) =>
    render(await HistoryPageRoute({ searchParams: Promise.resolve(strona === undefined ? {} : { strona }) }));

  it('strona z adresu, dane z sesji, AppShell z bieżącą sekcją i planem', async () => {
    data.listReports.mockResolvedValue({ ...PAGE, total: 45, page: 2, pageCount: 3 });
    await renderPage('2');
    expect(data.listReports).toHaveBeenCalledWith(data.db, 2);
    expect(data.getPlan).toHaveBeenCalledWith(data.db);
    expect(screen.getByText('Na start').className).toContain('sd-badge--plan');
    for (const link of screen.getAllByRole('link', { name: 'Raporty' }))
      expect(link.getAttribute('aria-current')).toBe('page');
  });

  it.each(['0', 'abc', '-3', '1.5'])('niepoprawne ?strona=%s → /app/raporty', async (strona) => {
    await expect(renderPage(strona)).rejects.toEqual(new RedirectError('/app/raporty'));
    expect(data.listReports).not.toHaveBeenCalled();
  });

  it('strona poza zakresem → ostatnia strona', async () => {
    data.listReports.mockResolvedValue({ ...PAGE, total: 45, page: 3, pageCount: 3 });
    await expect(renderPage('99')).rejects.toEqual(new RedirectError('/app/raporty?strona=3'));
  });

  it('strona poza zakresem przy jednej stronie → /app/raporty', async () => {
    data.listReports.mockResolvedValue(PAGE);
    await expect(renderPage('4')).rejects.toEqual(new RedirectError('/app/raporty'));
  });

  it('błąd bazy: Alert z przyczyną i naprawą, bez szczegółów w logu', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    data.listReports.mockRejectedValue(new Error('relation "reports" — Studio Lumi'));
    await renderPage('2');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(t.loadError.title);
    expect(alert.textContent).toContain(t.loadError.body);
    expect(within(alert).getByRole('link', { name: t.loadError.retry }).getAttribute('href')).toBe(
      '/app/raporty?strona=2',
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('Studio Lumi');
    log.mockRestore();
  });

  it('tytuł karty z numerem strony od drugiej', async () => {
    expect((await generateMetadata({ searchParams: Promise.resolve({}) })).title).toBe(t.meta.title);
    expect((await generateMetadata({ searchParams: Promise.resolve({ strona: '2' }) })).title).toBe(
      t.meta.titlePage(2),
    );
  });
});

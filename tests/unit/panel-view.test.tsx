// @vitest-environment jsdom
/**
 * Panel klientów w przeglądarce (jsdom): nagłówek z odmianą, karty z liczbami, tabela i karty telefonu
 * („—” zamiast 0, status słowem i ikoną, działania z nazwą klienta), pusty stan, okno „Dodaj klienta”
 * (etykiety, błędy przez aria-describedby, fokus, toast) i strona z miesiącem z adresu. Baza i akcja
 * są podmienione (vi.mock).
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddClientState } from '@/app/app/klienci/actions';
import { ToastProvider } from '@/components/ui/Toast';
import { panel as t } from '@/lib/copy/panel';
import type { MonthOverview, PanelRow } from '@/lib/data/panel';

vi.mock('server-only', () => ({}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const action = vi.hoisted(() => ({
  createClient: vi.fn<(prev: AddClientState, data: FormData) => Promise<AddClientState>>(),
}));
vi.mock('@/app/app/klienci/actions', () => ({ createClient: action.createClient }));

const data = vi.hoisted(() => ({
  monthOverview: vi.fn(),
  currentPlan: vi.fn(),
  db: { marker: 'db' },
}));
vi.mock('@/lib/data/panel', () => ({
  monthOverview: data.monthOverview,
  currentPlan: data.currentPlan,
}));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => data.db }));

const { PanelView } = await import('@/components/app/panel/PanelView');
const { default: ClientsPage, generateMetadata } = await import('@/app/app/klienci/page');

const NOW = new Date('2026-10-13T10:00:00Z');
const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const ROWS: PanelRow[] = [
  { id: ID(1), name: 'Studio Lumi', status: 'sent', book: 23, call: 9, views: 12480 },
  { id: ID(2), name: 'Bistro Pod Lipą', status: 'ready', book: 41, call: 17, views: 8320 },
  { id: ID(3), name: 'Fizjo Ruch', status: 'draft', book: 6, call: null, views: 3150 },
  { id: ID(4), name: 'Kwiaciarnia Pąk', status: 'no-export', book: null, call: null, views: null },
  { id: ID(5), name: 'Barber Brzytwa', status: 'no-export', book: null, call: null, views: null },
];

const OVERVIEW: MonthOverview = {
  rows: ROWS,
  sentCount: 1,
  total: 5,
  bookSum: 70,
  bookSumPrevious: 69,
};

const EMPTY: MonthOverview = { rows: [], sentCount: 0, total: 0, bookSum: null, bookSumPrevious: null };

function renderPanel(overview: MonthOverview = OVERVIEW, month = '2026-09') {
  return render(
    <ToastProvider>
      <PanelView month={month} now={NOW} overview={overview} />
    </ToastProvider>,
  );
}

function table() {
  return screen.getByRole('table', { name: t.table.caption('2026-09') });
}

function cards() {
  return screen.getByRole('list', { name: t.table.caption('2026-09') });
}

beforeEach(() => {
  action.createClient.mockReset();
  data.monthOverview.mockReset();
  data.currentPlan.mockReset();
  router.push.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('nagłówek i karty z liczbami', () => {
  it('h1 w miejscowniku, postęp z odmianą i dni robocze dla miesiąca należnego teraz', () => {
    renderPanel();
    expect(screen.getByRole('heading', { level: 1, name: 'Klienci we wrześniu' })).toBeTruthy();
    expect(
      screen.getByText('1 z 5 raportów wysłane. Do końca miesiąca zostało 14 dni roboczych.'),
    ).toBeTruthy();
  });

  it('dla wcześniejszego miesiąca bez zdania o dniach roboczych', () => {
    renderPanel({ ...OVERVIEW, rows: ROWS.slice(0, 1), sentCount: 1, total: 1 }, '2026-08');
    expect(screen.getByRole('heading', { level: 1, name: 'Klienci w sierpniu' })).toBeTruthy();
    expect(screen.getByText('1 z 1 raportu wysłane.')).toBeTruthy();
    expect(screen.queryByText(/dni robocz|dzień roboczy/)).toBeNull();
  });

  it('trzy karty: raporty wysłane z paskiem, suma „Zarezerwuj” z M−1, aktywni klienci', () => {
    renderPanel();
    const stats = within(screen.getByRole('region', { name: t.stats.label }));
    expect(stats.getByText('Raporty wysłane')).toBeTruthy();
    expect(stats.getByText('1 z 5')).toBeTruthy();
    const bar = stats.getByRole('progressbar', { name: 'Raporty wysłane: 1 z 5' });
    expect(bar.getAttribute('aria-valuenow')).toBe('20');
    expect(stats.getByText('„Zarezerwuj” u wszystkich klientów')).toBeTruthy();
    expect(stats.getByText('70')).toBeTruthy();
    expect(stats.getByText('sierpień: 69')).toBeTruthy();
    expect(stats.getByText('Aktywni klienci')).toBeTruthy();
    expect(stats.getByText('5')).toBeTruthy();
  });

  it('bez danych sumy to „—”, nie 0', () => {
    renderPanel({ ...OVERVIEW, bookSum: null, bookSumPrevious: null });
    const stats = within(screen.getByRole('region', { name: t.stats.label }));
    expect(stats.getByText('—')).toBeTruthy();
    expect(stats.getByText('sierpień: —')).toBeTruthy();
  });

  it('„Wgraj eksport” prowadzi do pierwszego klienta bez raportu; bez takiego — nie ma przycisku', () => {
    renderPanel();
    expect(screen.getByRole('link', { name: 'Wgraj eksport' }).getAttribute('href')).toBe(
      `/app/klienci/${ID(4)}/2026-09`,
    );
    cleanup();
    renderPanel({ ...OVERVIEW, rows: ROWS.slice(0, 3) });
    expect(screen.queryByRole('link', { name: 'Wgraj eksport' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Dodaj klienta' })).toBeTruthy();
  });
});

describe('tabela (od 768 px)', () => {
  it('kolumny jak w makiecie, liczby po polsku, brak danych to „—”', () => {
    renderPanel();
    const tbl = within(table());
    expect(tbl.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Klient',
      '„Zarezerwuj”',
      '„Zadzwoń”',
      'Wyświetlenia',
      'Status',
      'Działania',
    ]);
    const rows = tbl.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);
    const cells = (i: number) =>
      within(rows[i]!)
        .getAllByRole('cell')
        .map((td) => td.textContent);
    expect(cells(0).slice(0, 5)).toEqual(['SLStudio Lumi', '23', '9', '12 480', 'Wysłany']);
    expect(cells(1).slice(0, 5)).toEqual(['BLBistro Pod Lipą', '41', '17', '8320', 'Gotowy']);
    expect(cells(2).slice(0, 5)).toEqual(['FRFizjo Ruch', '6', '—', '3150', 'Szkic']);
    expect(cells(3).slice(0, 5)).toEqual(['KPKwiaciarnia Pąk', '—', '—', '—', 'Brak eksportu']);
  });

  it('awatar z inicjałami jest dekoracyjny, status ma ikonę i słowo', () => {
    renderPanel();
    const first = within(table()).getAllByRole('row')[1]!;
    expect(first.querySelector('.sd-avatar')?.getAttribute('aria-hidden')).toBe('true');
    const badge = within(first).getByText('Wysłany');
    expect(badge.className).toContain('sd-badge');
    expect(badge.querySelector('svg')).not.toBeNull();
  });

  it('działania w wierszach: nazwa z klientem i adres edytora (Gotowy → krok 3)', () => {
    renderPanel();
    const tbl = within(table());
    const expectLink = (name: string, href: string) =>
      expect(tbl.getByRole('link', { name }).getAttribute('href')).toBe(href);
    expectLink('Otwórz raport: Studio Lumi', `/app/klienci/${ID(1)}/2026-09`);
    expectLink('Wyślij raport: Bistro Pod Lipą', `/app/klienci/${ID(2)}/2026-09?krok=3`);
    expectLink('Dokończ raport: Fizjo Ruch', `/app/klienci/${ID(3)}/2026-09`);
    expectLink('Wgraj eksport: Kwiaciarnia Pąk', `/app/klienci/${ID(4)}/2026-09`);
    expect(tbl.getByRole('link', { name: 'Otwórz raport: Studio Lumi' }).textContent).toBe(
      'Otwórz raport: Studio Lumi',
    );
    expect(tbl.getByText('Otwórz').className).toBe('sd-btn sd-btn--ghost sd-btn--s');
  });

  it('przypis o „—” bez „Dane przykładowe” (dane są prawdziwe)', () => {
    renderPanel();
    expect(screen.getByText('„—” oznacza brak danych, nie zero.')).toBeTruthy();
    expect(screen.queryByText(/Dane przykładowe/)).toBeNull();
  });
});

describe('karty na telefonie (poniżej 768 px)', () => {
  it('karta na klienta: nazwa, liczby z etykietami, status i działanie', () => {
    renderPanel();
    const items = within(cards()).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    const fizjo = within(items[2]!);
    expect(fizjo.getByText('Fizjo Ruch')).toBeTruthy();
    const terms = fizjo.getAllByRole('term').map((dt) => dt.textContent);
    const values = fizjo.getAllByRole('definition').map((dd) => dd.textContent);
    expect(terms).toEqual(['„Zarezerwuj”', '„Zadzwoń”', 'Wyświetlenia', 'Status']);
    expect(values).toEqual(['6', '—', '3150', 'Szkic']);
    expect(fizjo.getByRole('link', { name: 'Dokończ raport: Fizjo Ruch' }).getAttribute('href')).toBe(
      `/app/klienci/${ID(3)}/2026-09`,
    );
  });
});

describe('pusty stan', () => {
  it('bez klientów: EmptyState z „Dodaj klienta” i przykładem, bez tabeli i kart z liczbami', () => {
    renderPanel(EMPTY);
    expect(screen.getByRole('heading', { level: 1, name: 'Klienci we wrześniu' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Dodaj pierwszego klienta' })).toBeTruthy();
    expect(screen.getByText(t.empty.body)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Dodaj klienta' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Zobacz przykładowy raport' }).getAttribute('href')).toBe(
      '/przyklad',
    );
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('region', { name: t.stats.label })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Wgraj eksport' })).toBeNull();
    expect(screen.queryByText(/raport(u|ów) wysłane/)).toBeNull();
  });
});

describe('okno „Dodaj klienta”', () => {
  function openDialog() {
    const opener = screen.getByRole('button', { name: 'Dodaj klienta' });
    opener.focus();
    act(() => opener.click());
    return { opener, dialog: screen.getByRole('dialog', { name: 'Dodaj klienta' }) };
  }

  async function submit(dialog: HTMLElement, state: AddClientState) {
    action.createClient.mockResolvedValueOnce(state);
    await act(async () => {
      fireEvent.submit(dialog.querySelector('form')!);
    });
  }

  it('etykiety nad polami, fokus na nazwie, branża domyślnie „Inna”', () => {
    renderPanel();
    const { dialog } = openDialog();
    const name = within(dialog).getByLabelText('Nazwa klienta') as HTMLInputElement;
    expect(document.activeElement).toBe(name);
    expect(name.getAttribute('maxlength')).toBe('80');
    expect(name.getAttribute('aria-describedby')).toBe(`${name.id}-hint`);
    expect(document.getElementById(`${name.id}-hint`)?.textContent).toBe(t.add.name.hint);
    const industry = within(dialog).getByLabelText('Branża') as HTMLSelectElement;
    expect(industry.value).toBe('inne');
    expect(Array.from(industry.options).map((o) => [o.value, o.textContent])).toEqual([
      ['salon', 'Salon'],
      ['restauracja', 'Restauracja'],
      ['gabinet', 'Gabinet'],
      ['sklep', 'Sklep'],
      ['inne', 'Inna'],
    ]);
  });

  it('wysyła nazwę i branżę; błąd pola przez aria-describedby, fokus na pole, wpis zostaje', async () => {
    renderPanel();
    const { dialog } = openDialog();
    const name = within(dialog).getByLabelText('Nazwa klienta') as HTMLInputElement;
    const industry = within(dialog).getByLabelText('Branża') as HTMLSelectElement;
    fireEvent.change(name, { target: { value: '   ' } });
    fireEvent.change(industry, { target: { value: 'salon' } });
    within(dialog).getByRole('button', { name: 'Anuluj' }).focus();

    await submit(dialog, { status: 'error', fieldErrors: { name: t.add.errors.nameRequired } });

    const sent = action.createClient.mock.calls[0]![1];
    expect(sent.get('name')).toBe('   ');
    expect(sent.get('industry')).toBe('salon');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(name.getAttribute('aria-describedby')).toBe(`${name.id}-hint ${name.id}-error`);
    expect(document.getElementById(`${name.id}-error`)?.textContent).toBe(t.add.errors.nameRequired);
    expect(document.activeElement).toBe(name);
    expect(name.value).toBe('   ');
    expect(industry.value).toBe('salon');
    expect(screen.getByRole('dialog', { name: 'Dodaj klienta' })).toBeTruthy();
  });

  it('błąd ogólny: Alert z przyczyną i naprawą, okno zostaje otwarte', async () => {
    renderPanel();
    const { dialog } = openDialog();
    fireEvent.change(within(dialog).getByLabelText('Nazwa klienta'), { target: { value: 'Kadr' } });
    await submit(dialog, { status: 'error', message: t.add.errors.failed });
    const alert = within(dialog).getByRole('alert');
    expect(alert.textContent).toContain(t.add.errors.failed);
    expect((within(dialog).getByLabelText('Nazwa klienta') as HTMLInputElement).value).toBe('Kadr');
  });

  it('sukces: okno się zamyka, toast „Klient dodany”, fokus wraca na przycisk', async () => {
    renderPanel();
    const { opener, dialog } = openDialog();
    fireEvent.change(within(dialog).getByLabelText('Nazwa klienta'), { target: { value: 'Kadr' } });
    await submit(dialog, { status: 'success', id: ID(6), name: 'Kadr' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Klient dodany')).toBeTruthy();
    expect(document.activeElement).toBe(opener);
  });

  it('ponowne otwarcie zaczyna od pustego formularza; Esc i „Anuluj” zamykają', async () => {
    renderPanel();
    let { dialog } = openDialog();
    fireEvent.change(within(dialog).getByLabelText('Nazwa klienta'), { target: { value: 'Kadr' } });
    await submit(dialog, { status: 'error', fieldErrors: { name: t.add.errors.nameTooLong } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    ({ dialog } = openDialog());
    expect((within(dialog).getByLabelText('Nazwa klienta') as HTMLInputElement).value).toBe('');
    expect(within(dialog).queryByText(t.add.errors.nameTooLong)).toBeNull();
    act(() => within(dialog).getByRole('button', { name: 'Anuluj' }).click());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('pierwszy klient z pustego stanu: przycisk znika, fokus przechodzi na nagłówek panelu', async () => {
    const view = renderPanel(EMPTY);
    const { dialog } = openDialog();
    fireEvent.change(within(dialog).getByLabelText('Nazwa klienta'), { target: { value: 'Kadr' } });
    await submit(dialog, { status: 'success', id: ID(6), name: 'Kadr' });
    // Odświeżona lista z serwera (revalidatePath) zastępuje pusty stan.
    const one: MonthOverview = {
      rows: [{ id: ID(6), name: 'Kadr', status: 'no-export', book: null, call: null, views: null }],
      sentCount: 0,
      total: 1,
      bookSum: null,
      bookSumPrevious: null,
    };
    view.rerender(
      <ToastProvider>
        <PanelView month="2026-09" now={NOW} overview={one} />
      </ToastProvider>,
    );
    const heading = screen.getByRole('heading', { level: 1, name: 'Klienci we wrześniu' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });
});

describe('strona /app/klienci', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  async function renderPage(m?: string | string[]) {
    const ui = await ClientsPage({ searchParams: Promise.resolve(m === undefined ? {} : { m }) });
    return render(<ToastProvider>{ui}</ToastProvider>);
  }

  it('domyślnie ostatni pełny miesiąc; dane z sesji; plakietka planu i przełącznik miesiąca', async () => {
    data.monthOverview.mockResolvedValue(OVERVIEW);
    data.currentPlan.mockResolvedValue('free');
    await renderPage();
    expect(data.monthOverview).toHaveBeenCalledWith(data.db, '2026-09');
    expect(screen.getByRole('heading', { level: 1, name: 'Klienci we wrześniu' })).toBeTruthy();
    expect(screen.getByText('Na start').className).toContain('sd-badge--plan');
    expect(screen.getByText('Wrzesień 2026')).toBeTruthy();
    for (const link of screen.getAllByRole('link', { name: 'Klienci' }))
      expect(link.getAttribute('aria-current')).toBe('page');
    act(() => screen.getByRole('button', { name: 'Poprzedni miesiąc' }).click());
    expect(router.push).toHaveBeenCalledWith('/app/klienci?m=2026-08');
  });

  it('przyszły miesiąc → bieżący (bez „Następny”), błędny → domyślny', async () => {
    data.monthOverview.mockResolvedValue(OVERVIEW);
    data.currentPlan.mockResolvedValue('solo');
    await renderPage('2027-01');
    expect(data.monthOverview).toHaveBeenLastCalledWith(data.db, '2026-10');
    expect(screen.getByText('Solo')).toBeTruthy();
    const next = screen.getByRole('button', { name: 'Następny miesiąc' });
    expect(next.getAttribute('aria-disabled')).toBe('true');
    cleanup();
    await renderPage('2026-1');
    expect(data.monthOverview).toHaveBeenLastCalledWith(data.db, '2026-09');
  });

  it('tytuł strony z miesiącem', async () => {
    const meta = await generateMetadata({ searchParams: Promise.resolve({ m: '2026-08' }) });
    expect(meta.title).toBe('Klienci w sierpniu 2026');
  });

  it('błąd bazy: Alert z przyczyną i naprawą, bez szczegółów w logu', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    data.monthOverview.mockRejectedValue(new Error('relation "clients" — Studio Lumi'));
    data.currentPlan.mockResolvedValue('free');
    await renderPage('2026-08');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(t.loadError.title);
    expect(alert.textContent).toContain(t.loadError.body);
    expect(within(alert).getByRole('link', { name: t.loadError.retry }).getAttribute('href')).toBe(
      '/app/klienci?m=2026-08',
    );
    expect(log).toHaveBeenCalledWith('[sedno] Panel klientów: nie udało się wczytać danych.');
    expect(JSON.stringify(log.mock.calls)).not.toContain('Studio Lumi');
  });
});

// @vitest-environment jsdom
/**
 * Edytor raportu z kontem (components/editor/ReportEditor.tsx) w przeglądarce (jsdom): kroki 1–3, zapis szkicu,
 * „Przejdź do wysyłki”, link (utwórz, kopiuj, wyłącz), PDF z logo, oznaczenie wysłania z „Cofnij”, historia M−1
 * i edycja zapisanego raportu bez pliku. Parser, PDF, analityka i działania serwera są podmienione.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportEditor, type ReportEditorProps } from '@/components/editor/ReportEditor';
import type { EditorActions, LinkView, SavedSnapshot } from '@/components/editor/types';
import { PHONE_QUERY, WIDE_QUERY } from '@/components/tool/media';
import { ToastProvider } from '@/components/ui/Toast';
import { track } from '@/lib/analytics/client';
import { parseFileInWorker, type ParseFileResult } from '@/lib/csv/client';
import type { ParsedExport, PostRow, PostType } from '@/lib/csv/types';
import { downloadReportPdf } from '@/lib/pdf/download';
import { computeReport } from '@/lib/report/compute';
import { reportDataSchema, type ReportData } from '@/lib/report/types';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/csv/client', () => ({ parseFileInWorker: vi.fn() }));
vi.mock('@/lib/pdf/download', () => ({ downloadReportPdf: vi.fn() }));
vi.mock('@/lib/analytics/client', () => ({ track: vi.fn() }));

const parseMock = vi.mocked(parseFileInWorker);
const pdfMock = vi.mocked(downloadReportPdf);
const trackMock = vi.mocked(track);

const CLIENT_ID = '0b9f8a3c-5d1e-4f2a-9c7b-1a2b3c4d5e6f';
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';
const URL_BASE = 'https://sedno.example';
const TYPES: PostType[] = ['reel', 'post', 'story'];

function between(from: string, to: string, step = 2): ParsedExport {
  const rows: PostRow[] = [];
  for (
    let t = Date.parse(`${from}T10:00:00Z`), i = 0;
    t <= Date.parse(`${to}T10:00:00Z`);
    t += step * 864e5, i++
  ) {
    rows.push({
      publishedAt: new Date(t),
      type: TYPES[i % TYPES.length]!,
      views: 400 * (i + 1),
      reach: null,
      likes: 20 + i,
      comments: 2,
      shares: 1,
      saves: 3,
      follows: 1,
    });
  }
  return {
    rows,
    range: { from: rows[0]!.publishedAt, to: rows.at(-1)!.publishedAt },
    months: [...new Set(rows.map((r) => r.publishedAt.toISOString().slice(0, 7)))],
    warnings: [],
    fields: ['publishedAt', 'views', 'likes', 'comments', 'shares', 'saves', 'follows', 'type'],
  };
}

const SEPTEMBER = between('2026-09-01', '2026-09-30');

/** Zapisany raport za wrzesień (tak jak zapisałby go edytor). */
function savedReport(overrides: Partial<ReportData> = {}): ReportData {
  const result = computeReport({
    parsed: SEPTEMBER,
    month: '2026-09',
    now: new Date('2026-10-13T10:00:00Z'),
    client: { name: 'Studio Lumi' },
    author: { name: 'Kadr Social' },
    branding: 'sedno-footer',
    actions: { book: 23, call: 9, directions: 14 },
    commentWorked: 'Najwięcej rezerwacji przyszło po rolkach z metamorfozami brwi.',
    planNext: 'Cztery kolejne rolki.',
  });
  if (!result.ok) throw new Error('fixture');
  return { ...result.report, ...overrides };
}

const HISTORY = {
  summary: { posts: 20, views: 9000, interactions: 400, follows: 30 },
  actions: { book: 17, call: 11, directions: 10 },
};

function linkView(overrides: Partial<LinkView> = {}): LinkView {
  return {
    token: TOKEN,
    url: `${URL_BASE}/r/${TOKEN}`,
    expiresAt: '2027-10-13T10:00:00Z',
    views: 0,
    ...overrides,
  };
}

function mockActions(): EditorActions & { [K in keyof EditorActions]: ReturnType<typeof vi.fn> } {
  return {
    save: vi.fn(async ({ data, intent }) => ({
      ok: true as const,
      report: { data, status: intent === 'ready' ? ('ready' as const) : ('draft' as const), sentAt: null },
    })),
    createLink: vi.fn(async () => ({ ok: true as const, link: linkView() })),
    revokeLink: vi.fn(async () => ({ ok: true as const })),
    markSent: vi.fn(async () => ({
      ok: true as const,
      report: { status: 'sent' as const, sentAt: '2026-10-13T10:00:00Z' },
    })),
    undoSent: vi.fn(async () => ({ ok: true as const, report: { status: 'ready' as const, sentAt: null } })),
  } as never;
}

function setViewport({ phone, wide }: { phone: boolean; wide: boolean }) {
  window.matchMedia = ((query: string) => ({
    matches: query === WIDE_QUERY ? wide : query === PHONE_QUERY ? phone : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function renderEditor(props: Partial<ReportEditorProps> = {}) {
  const actions = (props.actions ?? mockActions()) as ReturnType<typeof mockActions>;
  const all: ReportEditorProps = {
    client: { id: CLIENT_ID, name: 'Studio Lumi' },
    month: '2026-09',
    author: { name: 'Kadr Social', hasLogo: false },
    saved: null,
    history: null,
    link: null,
    initialStep: 'upload',
    ...props,
    actions,
  };
  const view = render(
    <ToastProvider>
      <ReportEditor {...all} />
    </ToastProvider>,
  );
  return { ...view, actions };
}

function snapshot(data = savedReport(), status: SavedSnapshot['status'] = 'draft'): SavedSnapshot {
  return { data, status, sentAt: status === 'sent' ? '2026-10-02T09:30:00Z' : null };
}

function chooseFile() {
  const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
  expect(inputs).toHaveLength(1);
  const file = new File(['x'.repeat(2048)], 'eksport.csv', { type: 'text/csv' });
  fireEvent.change(inputs[0]!, { target: { files: [file] } });
}

async function uploadTo2(data: ParsedExport = SEPTEMBER) {
  const result: ParseFileResult = { result: { ok: true, data }, ms: 40 };
  parseMock.mockResolvedValueOnce(result);
  chooseFile();
  await screen.findByRole('button', { name: 'Zapisz szkic' });
}

function steps() {
  const list = screen.getByRole('list', { name: 'Kroki raportu' });
  const items = within(list).getAllByRole('listitem');
  return {
    labels: items.map((li) => li.textContent),
    current: items.findIndex((li) => li.getAttribute('aria-current') === 'step') + 1,
  };
}

function clickButton(name: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
}

function trackCalls(name: string) {
  return trackMock.mock.calls.filter(([event]) => event === name);
}

async function expectFocus(element: Element) {
  await waitFor(() => expect(document.activeElement).toBe(element));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(window, 'matchMedia');
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('krok 1 — bez zapisanego raportu', () => {
  it('nagłówek z klientem i miesiącem, link do listy, kroki, informacja o zapisie liczb i linia prywatności', () => {
    renderEditor();
    expect(screen.getByRole('heading', { level: 1, name: 'Raport: Studio Lumi, wrzesień' })).toBeTruthy();
    const back = screen.getByRole('link', { name: 'Klienci, lista za wrzesień 2026' });
    expect(back.getAttribute('href')).toBe('/app/klienci?m=2026-09');
    expect(steps()).toEqual({
      labels: ['1. Wgraj eksport', '2. Efekty i komentarz', '3. Wyślij'],
      current: 1,
    });
    expect(screen.getByText('Zapisujemy liczby, nie plik')).toBeTruthy();
    expect(screen.getByText(/trafiają na serwer tylko liczby z podsumowania eksportu/)).toBeTruthy();
    expect(screen.getByText('Plik zostaje w Twojej przeglądarce. Nie wysyłamy go na serwer.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Wybierz plik' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Wróć do zapisanego raportu' })).toBeNull();
  });

  it('po wczytaniu pliku: krok 2 z autorem z konta (bez pól autora i klienta) i przyciskami zapisu', async () => {
    renderEditor();
    await uploadTo2();
    const heading = screen.getByRole('heading', { level: 1, name: 'Raport: Studio Lumi, wrzesień' });
    await expectFocus(heading);
    expect(steps()).toEqual({
      labels: ['1. Eksport wczytany', '2. Efekty i komentarz', '3. Wyślij'],
      current: 2,
    });
    expect(screen.getByText('Autor na raporcie: Kadr Social.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Zmień w Ustawieniach' }).getAttribute('href')).toBe(
      '/app/ustawienia',
    );
    expect(screen.queryByLabelText('Twoja nazwa albo marka')).toBeNull();
    expect(screen.queryByLabelText('Nazwa klienta')).toBeNull();
    expect(screen.getByText(/Wczytano 15 publikacji z września/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zapisz szkic' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Przejdź do wysyłki' })).toBeTruthy();
    // Nazwa autora nie trafia do pamięci przeglądarki (pochodzi z konta).
    expect(window.localStorage.getItem('sedno.authorName')).toBeNull();
  });
});

describe('zapis', () => {
  it('„Zapisz szkic”: ReportData z liczbami (bez wierszy pliku), klient i autor z konta, toast', async () => {
    const { actions } = renderEditor();
    await uploadTo2();
    fireEvent.change(screen.getByLabelText('Kliknięcia „Zarezerwuj”'), { target: { value: '23' } });
    clickButton('Zapisz szkic');
    expect(await screen.findByText('Szkic zapisany')).toBeTruthy();
    expect(actions.save).toHaveBeenCalledTimes(1);
    const input = actions.save.mock.calls[0]![0] as { data: ReportData; intent: string; clientId: string };
    expect(input).toMatchObject({ clientId: CLIENT_ID, month: '2026-09', intent: 'draft' });
    expect(reportDataSchema.safeParse(input.data).success).toBe(true);
    expect(input.data.client).toEqual({ name: 'Studio Lumi' });
    expect(input.data.author).toEqual({ name: 'Kadr Social' });
    expect(input.data.branding).toBe('sedno-footer');
    expect(input.data.actions.book).toBe(23);
    expect(Object.keys(input.data)).not.toContain('rows');
    expect(JSON.stringify(input)).not.toContain('publishedAt":"2026-09-03');
    // Szkic zostaje w kroku 2.
    expect(steps().current).toBe(2);
  });

  it('gotowy albo wysłany raport to nie szkic: „Zapisz zmiany” → „Zmiany zapisane”, status bez zmian', async () => {
    for (const status of ['ready', 'sent'] as const) {
      const actions = mockActions();
      actions.save.mockImplementation(async ({ data }: { data: ReportData }) => ({
        ok: true as const,
        report: { data, status, sentAt: status === 'sent' ? '2026-10-02T09:30:00Z' : null },
      }));
      renderEditor({ saved: snapshot(savedReport(), status), initialStep: 'effects', actions });
      expect(screen.queryByRole('button', { name: 'Zapisz szkic' })).toBeNull();
      clickButton('Zapisz zmiany');
      expect(await screen.findByText('Zmiany zapisane')).toBeTruthy();
      expect(screen.queryByText('Szkic zapisany')).toBeNull();
      expect(actions.save.mock.calls[0]![0]).toMatchObject({ intent: 'draft' });
      expect(screen.getByRole('button', { name: 'Zapisz zmiany' })).toBeTruthy();
      cleanup();
    }
  });

  it('szkic zapisany drugi raz nadal jest szkicem: „Zapisz szkic” → „Szkic zapisany”', async () => {
    renderEditor({ saved: snapshot(savedReport(), 'draft'), initialStep: 'effects' });
    clickButton('Zapisz szkic');
    expect(await screen.findByText('Szkic zapisany')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zapisz szkic' })).toBeTruthy();
  });

  it('błąd zapisu: przyczyna i naprawa, bez toastu', async () => {
    const actions = mockActions();
    actions.save.mockResolvedValueOnce({
      ok: false,
      error: 'Serwer nie odpowiedział. Sprawdź połączenie i spróbuj ponownie.',
    });
    renderEditor({ actions });
    await uploadTo2();
    clickButton('Zapisz szkic');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Nie udało się zapisać raportu');
    expect(alert.textContent).toContain('Sprawdź połączenie i spróbuj ponownie.');
    expect(screen.queryByText('Szkic zapisany')).toBeNull();
  });

  it('„Przejdź do wysyłki” zapisuje jako gotowy i otwiera krok 3 z podglądem raportu', async () => {
    const { actions } = renderEditor();
    await uploadTo2();
    clickButton('Przejdź do wysyłki');
    await waitFor(() => expect(steps().current).toBe(3));
    await expectFocus(screen.getByRole('heading', { level: 1, name: 'Raport: Studio Lumi, wrzesień' }));
    expect(actions.save.mock.calls[0]![0]).toMatchObject({ intent: 'ready' });
    expect(screen.getByText('Gotowy')).toBeTruthy();
    const sheet = screen.getByRole('region', { name: 'Raport dla klienta' });
    expect(within(sheet).getByText('dla: Studio Lumi')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Utwórz link' })).toBeTruthy();
    expect(trackCalls('report_previewed')).toEqual([['report_previewed', { mode: 'account' }]]);
  });
});

describe('krok 3 — wysyłka', () => {
  function renderSend(props: Partial<ReportEditorProps> = {}) {
    return renderEditor({ saved: snapshot(savedReport(), 'ready'), initialStep: 'send', ...props });
  }

  it('utwórz link: adres w polu tylko do odczytu, ważność, licznik, fokus na „Kopiuj link”', async () => {
    const { actions } = renderSend();
    clickButton('Utwórz link');
    const copy = await screen.findByRole('button', { name: 'Kopiuj link' });
    expect(actions.createLink).toHaveBeenCalledWith({ clientId: CLIENT_ID, month: '2026-09' });
    const field = screen.getByLabelText('Adres linku') as HTMLInputElement;
    expect(field.value).toBe(`${URL_BASE}/r/${TOKEN}`);
    expect(field.readOnly).toBe(true);
    expect(document.getElementById(field.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Link działa do 13 października 2027. Link otwarto 0 razy.',
    );
    await expectFocus(copy);
    expect(await screen.findByText('Link utworzony')).toBeTruthy();
  });

  it('kopiuj link: schowek i toast „Link skopiowany”; bez schowka — zaznaczony adres i przyczyna', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderSend({ link: linkView({ views: 3 }) });
    expect(screen.getByText(/Link otwarto 3 razy\./)).toBeTruthy();
    clickButton('Kopiuj link');
    expect(await screen.findByText('Link skopiowany')).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(`${URL_BASE}/r/${TOKEN}`);

    writeText.mockRejectedValueOnce(new Error('denied'));
    clickButton('Kopiuj link');
    expect(
      await screen.findByText('Nie udało się skopiować linku. Zaznacz adres w polu i skopiuj go ręcznie.'),
    ).toBeTruthy();
    await expectFocus(screen.getByLabelText('Adres linku'));
  });

  it('wyłącz link: potwierdzenie w oknie, toast, wyjaśnienie i „Utwórz nowy link” z fokusem', async () => {
    const { actions } = renderSend({ link: linkView() });
    clickButton('Wyłącz link');
    const dialog = screen.getByRole('dialog', { name: 'Wyłączyć link?' });
    expect(
      within(dialog).getByText(/klient zobaczy komunikat, że raport nie jest już dostępny/),
    ).toBeTruthy();
    // Esc zamyka bez wyłączania.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(actions.revokeLink).not.toHaveBeenCalled();

    clickButton('Wyłącz link');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Wyłącz link' }));
    const create = await screen.findByRole('button', { name: 'Utwórz nowy link' });
    expect(actions.revokeLink).toHaveBeenCalledWith({ token: TOKEN });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByLabelText('Adres linku')).toBeNull();
    expect(screen.getByText(/Link jest wyłączony\./)).toBeTruthy();
    expect(await screen.findByText('Link wyłączony')).toBeTruthy();
    await expectFocus(create);
  });

  it('błąd linku: przyczyna i naprawa przy sekcji linku', async () => {
    const actions = mockActions();
    actions.createLink.mockResolvedValueOnce({
      ok: false,
      error: 'Za dużo nowych linków w krótkim czasie. Spróbuj ponownie za kilka minut.',
    });
    renderSend({ actions });
    clickButton('Utwórz link');
    expect((await screen.findByRole('alert')).textContent).toContain('Spróbuj ponownie za kilka minut.');
  });

  it('oznacz jako wysłany: toast „Raport dla Studio Lumi wysłany” z „Cofnij”, które przywraca „Gotowy”', async () => {
    const { actions } = renderSend();
    clickButton('Oznacz jako wysłany');
    const toast = (await screen.findByText('Raport dla Studio Lumi wysłany')).closest(
      '.sd-toast',
    ) as HTMLElement;
    expect(actions.markSent).toHaveBeenCalledWith({ clientId: CLIENT_ID, month: '2026-09' });
    expect(screen.getByText('Wysłany')).toBeTruthy();
    expect(screen.getByText('Oznaczony jako wysłany 13 października 2026.')).toBeTruthy();
    await expectFocus(screen.getByRole('button', { name: 'Cofnij oznaczenie' }));

    fireEvent.click(within(toast).getByRole('button', { name: 'Cofnij' }));
    expect(await screen.findByText('Oznaczenie cofnięte')).toBeTruthy();
    expect(actions.undoSent).toHaveBeenCalledWith({ clientId: CLIENT_ID, month: '2026-09' });
    expect(screen.getByText('Gotowy')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Oznacz jako wysłany' })).toBeTruthy();
  });

  it('wysłany raport: „Cofnij oznaczenie” bez toastu też przywraca „Gotowy”', async () => {
    const { actions } = renderEditor({ saved: snapshot(savedReport(), 'sent'), initialStep: 'send' });
    expect(screen.getByText('Oznaczony jako wysłany 2 października 2026.')).toBeTruthy();
    clickButton('Cofnij oznaczenie');
    expect(await screen.findByText('Oznaczenie cofnięte')).toBeTruthy();
    expect(actions.undoSent).toHaveBeenCalledTimes(1);
    await expectFocus(screen.getByRole('button', { name: 'Oznacz jako wysłany' }));
  });

  it('PDF z logo z konta: /app/logo, toast i zdarzenie bez treści', async () => {
    pdfMock.mockResolvedValueOnce('raport-studio-lumi-2026-09.pdf');
    const saved = savedReport();
    renderSend({ saved: snapshot(saved, 'ready'), author: { name: 'Kadr Social', hasLogo: true } });
    const sheet = screen.getByRole('region', { name: 'Raport dla klienta' });
    expect(within(sheet).getByRole('img', { name: 'Kadr Social' }).getAttribute('src')).toBe('/app/logo');
    clickButton('Pobierz PDF');
    expect(await screen.findByText('PDF pobrany')).toBeTruthy();
    expect(pdfMock).toHaveBeenCalledWith(saved, { logoSrc: '/app/logo' });
    expect(trackCalls('pdf_downloaded')).toEqual([
      ['pdf_downloaded', { mode: 'account', branding: 'sedno-footer' }],
    ]);
  });

  it('PDF bez logo i nieudany PDF: przyczyna i naprawa', async () => {
    pdfMock.mockRejectedValueOnce(new Error('font'));
    renderSend();
    clickButton('Pobierz PDF');
    expect((await screen.findByRole('alert')).textContent).toContain('Nie udało się utworzyć PDF');
    expect(pdfMock).toHaveBeenCalledWith(expect.objectContaining({ period: '2026-09' }), undefined);
  });

  it('„Wróć do edycji”: krok 2 z informacją, że klient ma link', async () => {
    renderSend({ link: linkView() });
    clickButton('Wróć do edycji');
    expect(await screen.findByRole('button', { name: 'Zapisz zmiany' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Zapisz szkic' })).toBeNull();
    expect(steps().current).toBe(2);
    expect(
      screen.getByText('Klient ma link do tego raportu. Po zapisaniu zobaczy zmiany pod tym samym adresem.'),
    ).toBeTruthy();
  });
});

describe('zapisany raport bez pliku', () => {
  it('krok 2: pola z zapisu, informacja o liczbach z zapisu, zmiana liczby zmienia podgląd i zapis', async () => {
    setViewport({ phone: false, wide: true });
    const saved = savedReport();
    const { actions } = renderEditor({ saved: snapshot(saved), initialStep: 'effects' });
    expect(screen.getByText('Liczby z zapisanego raportu')).toBeTruthy();
    expect(screen.getByText(/Pliku CSV nie zapisujemy, więc żeby policzyć je od nowa/)).toBeTruthy();
    expect((screen.getByLabelText('Kliknięcia „Zarezerwuj”') as HTMLInputElement).value).toBe('23');
    expect((screen.getByLabelText('Co zadziałało') as HTMLTextAreaElement).value).toBe(saved.commentWorked);
    const preview = screen.getByRole('complementary', { name: 'Podgląd dla klienta' });
    expect(
      within(preview).getByRole('heading', { level: 2, name: '23 osoby chciały się umówić' }),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Kliknięcia „Zarezerwuj”'), { target: { value: '41' } });
    expect(
      within(preview).getByRole('heading', { level: 2, name: '41 osób chciało się umówić' }),
    ).toBeTruthy();
    clickButton('Zapisz szkic');
    await screen.findByText('Szkic zapisany');
    const data = (actions.save.mock.calls[0]![0] as { data: ReportData }).data;
    expect(data.actions.book).toBe(41);
    expect(data.headline).toBe('41 osób chciało się umówić');
    expect(data.summary).toEqual(saved.summary);
    expect(data.dataRange).toEqual(saved.dataRange);
  });

  it('report_previewed raz na wczytany raport i raz na każdy nowy plik', async () => {
    setViewport({ phone: false, wide: true });
    renderEditor({ saved: snapshot(), initialStep: 'effects' });
    expect(trackCalls('report_previewed')).toEqual([['report_previewed', { mode: 'account' }]]);
    fireEvent.change(screen.getByLabelText('Kliknięcia „Zadzwoń”'), { target: { value: '12' } });
    expect(trackCalls('report_previewed')).toHaveLength(1);
    clickButton('Wgraj eksport ponownie');
    await uploadTo2();
    expect(trackCalls('report_previewed')).toHaveLength(2);
  });

  it('„Wgraj eksport ponownie” → krok 1 z wyjaśnieniem; „Wróć do zapisanego raportu” wraca bez pliku', async () => {
    renderEditor({ saved: snapshot(), initialStep: 'effects' });
    clickButton('Wgraj eksport ponownie');
    const heading = screen.getByRole('heading', { level: 1, name: 'Raport: Studio Lumi, wrzesień' });
    await expectFocus(heading);
    expect(steps().current).toBe(1);
    expect(screen.getByText(/Ten raport ma zapisane liczby z podsumowania, ale nie plik CSV/)).toBeTruthy();
    clickButton('Wróć do zapisanego raportu');
    expect(await screen.findByText('Liczby z zapisanego raportu')).toBeTruthy();
    expect(steps().current).toBe(2);
  });

  it('nowy plik liczy raport od nowa, a wpisane efekty i komentarz zostają', async () => {
    const saved = savedReport();
    const { actions } = renderEditor({ saved: snapshot(saved), initialStep: 'upload' });
    await uploadTo2(between('2026-09-01', '2026-09-30', 3));
    expect(screen.queryByText('Liczby z zapisanego raportu')).toBeNull();
    expect((screen.getByLabelText('Kliknięcia „Zarezerwuj”') as HTMLInputElement).value).toBe('23');
    clickButton('Zapisz szkic');
    await screen.findByText('Szkic zapisany');
    const data = (actions.save.mock.calls[0]![0] as { data: ReportData }).data;
    expect(data.summary.posts).toBe(10);
    expect(data.summary.posts).not.toBe(saved.summary.posts);
    expect(data.commentWorked).toBe(saved.commentWorked);
  });

  it('plik bez publikacji z miesiąca: przyczyna, inny plik albo powrót do zapisu (bez przełączania miesiąca)', async () => {
    renderEditor({ saved: snapshot(), initialStep: 'upload' });
    parseMock.mockResolvedValueOnce({
      result: { ok: true, data: between('2026-07-01', '2026-07-31') },
      ms: 10,
    });
    chooseFile();
    expect(await screen.findByText(/W pliku nie ma publikacji z września/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Przełącz na/ })).toBeNull();
    expect(trackCalls('csv_error')).toEqual([['csv_error', { code: 'E_NO_ROWS_IN_MONTH' }]]);
    clickButton('Wróć do zapisanego raportu');
    expect(await screen.findByText('Liczby z zapisanego raportu')).toBeTruthy();
  });
});

describe('historia M−1', () => {
  it('liczby z zapisanego raportu za sierpień pod polami, bez pól ręcznych, z informacją o źródle', async () => {
    renderEditor({ saved: snapshot(), history: HISTORY, initialStep: 'effects' });
    const book = screen.getByLabelText('Kliknięcia „Zarezerwuj”');
    expect(document.getElementById(book.getAttribute('aria-describedby')!)?.textContent).toBe('sierpień: 17');
    const call = screen.getByLabelText('Kliknięcia „Zadzwoń”');
    expect(document.getElementById(call.getAttribute('aria-describedby')!)?.textContent).toBe('sierpień: 11');
    expect(
      screen.getByText('Porównanie z sierpniem pochodzi z zapisanego raportu za sierpień.'),
    ).toBeTruthy();
    expect(screen.queryByText('Dodaj liczby z sierpnia (nieobowiązkowe)')).toBeNull();
  });

  it('z nowym plikiem porównanie też pochodzi z historii', async () => {
    const { actions } = renderEditor({ history: HISTORY });
    await uploadTo2();
    const book = screen.getByLabelText('Kliknięcia „Zarezerwuj”');
    expect(document.getElementById(book.getAttribute('aria-describedby')!)?.textContent).toBe('sierpień: 17');
    clickButton('Zapisz szkic');
    await screen.findByText('Szkic zapisany');
    const data = (actions.save.mock.calls[0]![0] as { data: ReportData }).data;
    expect(data.previous).toMatchObject({ source: 'history', actions: HISTORY.actions });
  });

  it('plik z pełnym M−1: wyświetlenia z pliku, kliknięcia z historii (i taka informacja)', async () => {
    renderEditor({ history: HISTORY });
    await uploadTo2(between('2026-08-01', '2026-09-30'));
    expect(screen.getByText('Kliknięcia z sierpnia pochodzą z zapisanego raportu za sierpień.')).toBeTruthy();
    const book = screen.getByLabelText('Kliknięcia „Zarezerwuj”');
    expect(document.getElementById(book.getAttribute('aria-describedby')!)?.textContent).toBe('sierpień: 17');
    expect(screen.queryByText('Dodaj liczby z sierpnia (nieobowiązkowe)')).toBeNull();
  });

  it('raport za M−1 bez kliknięć: wyświetlenia z historii, pola ręczne tylko na kliknięcia', async () => {
    renderEditor({
      saved: snapshot(),
      initialStep: 'effects',
      history: { ...HISTORY, actions: { book: null, call: null, directions: null } },
    });
    expect(
      screen.getByText('Wyświetlenia z sierpnia pochodzą z zapisanego raportu za sierpień.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Kliknięcia „Zarezerwuj” w sierpniu')).toBeTruthy();
    expect(screen.queryByLabelText('Wyświetlenia w sierpniu')).toBeNull();
  });

  it('bez historii: pola ręczne M−1 jak w /nowy', async () => {
    renderEditor({ saved: snapshot(), initialStep: 'effects' });
    expect(screen.getByText('Dodaj liczby z sierpnia (nieobowiązkowe)')).toBeTruthy();
    expect(screen.getByLabelText('Kliknięcia „Zarezerwuj” w sierpniu')).toBeTruthy();
  });
});

describe('autor', () => {
  it('bez nazwy autora i z logo: informacja i link do Ustawień', () => {
    renderEditor({ saved: snapshot(), initialStep: 'effects', author: { name: '', hasLogo: true } });
    expect(screen.getByText('Na raporcie jest Twoje logo.')).toBeTruthy();
  });

  it('bez nazwy i logo: raport zaczyna się od klienta', () => {
    renderEditor({ saved: snapshot(), initialStep: 'effects', author: { name: '', hasLogo: false } });
    expect(screen.getByText('Raport nie ma nazwy autora, więc zaczyna się od nazwy klienta.')).toBeTruthy();
  });

  it('z logo: podgląd na żywo pokazuje logo z /app/logo', () => {
    setViewport({ phone: false, wide: true });
    renderEditor({
      saved: snapshot(),
      initialStep: 'effects',
      author: { name: 'Kadr Social', hasLogo: true },
    });
    expect(screen.getByText('Autor na raporcie: Kadr Social, z Twoim logo.')).toBeTruthy();
    const preview = screen.getByRole('complementary', { name: 'Podgląd dla klienta' });
    expect(within(preview).getByRole('img', { name: 'Kadr Social' }).getAttribute('src')).toBe('/app/logo');
  });
});

describe('telefon', () => {
  it('przyciski zapisu na całą szerokość i 48 px, bez podglądu na żywo', async () => {
    renderEditor({ saved: snapshot(), initialStep: 'effects' });
    const save = screen.getByRole('button', { name: 'Zapisz szkic' });
    expect(save.className).toContain('sd-btn--l');
    expect(save.className).toContain('sd-btn--block');
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(trackCalls('report_previewed')).toHaveLength(0);
    await act(async () => {
      clickButton('Przejdź do wysyłki');
    });
    expect(await screen.findByRole('region', { name: 'Raport dla klienta' })).toBeTruthy();
    expect(trackCalls('report_previewed')).toHaveLength(1);
  });
});

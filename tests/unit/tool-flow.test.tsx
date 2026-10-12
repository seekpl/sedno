// @vitest-environment jsdom
/**
 * Narzędzie /nowy w przeglądarce (jsdom): wgranie → efekty → podgląd i PDF. Parser, PDF i analityka są
 * podmienione (vi.mock), więc test sprawdza wyłącznie interfejs: kroki, fokus, teksty, odmianę, dostępność
 * i to, co trafia do zdarzeń i localStorage (nigdy treść pliku).
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PHONE_QUERY, WIDE_QUERY } from '@/components/tool/media';
import { NewReportFlow } from '@/components/tool/NewReportFlow';
import { ToastProvider } from '@/components/ui/Toast';
import { track } from '@/lib/analytics/client';
import { parseFileInWorker, type ParseFileResult } from '@/lib/csv/client';
import { COLUMN_MAPPING_KEY } from '@/lib/csv/mapping-storage';
import type { ParsedExport, PostRow, PostType } from '@/lib/csv/types';
import { addMonths } from '@/lib/i18n/pl';
import { downloadReportPdf } from '@/lib/pdf/download';
import type { ReportData } from '@/lib/report/types';

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

const TYPES: PostType[] = ['reel', 'post', 'story'];

function row(date: string, i: number): PostRow {
  return {
    publishedAt: new Date(date),
    type: TYPES[i % TYPES.length]!,
    views: 400 * (i + 1),
    reach: null,
    likes: 20 + i,
    comments: 2,
    shares: 1,
    saves: 3,
    follows: 1,
  };
}

/** n publikacji we wrześniu 2026, od 1. do 30. dnia (pełny miesiąc, bez ostrzeżeń). */
function september(n: number, lastDay = 30): ParsedExport {
  const rows = Array.from({ length: n }, (_, i) => {
    const day = n === 1 ? lastDay : 1 + Math.round((i * (lastDay - 1)) / (n - 1));
    return row(`2026-09-${String(day).padStart(2, '0')}T10:00:00Z`, i);
  });
  return {
    rows,
    range: { from: rows[0]!.publishedAt, to: rows.at(-1)!.publishedAt },
    months: ['2026-09'],
    warnings: [],
    fields: ['publishedAt', 'views', 'likes', 'comments', 'shares', 'saves', 'follows', 'type'],
  };
}

/** Publikacje co `step` dni od `from` do `to` (włącznie), z miesiącami jak z parsera. */
function between(from: string, to: string, step = 2): ParsedExport {
  const rows: PostRow[] = [];
  for (
    let t = Date.parse(`${from}T10:00:00Z`), i = 0;
    t <= Date.parse(`${to}T10:00:00Z`);
    t += step * 864e5, i++
  ) {
    rows.push(row(new Date(t).toISOString(), i));
  }
  return {
    rows,
    range: { from: rows[0]!.publishedAt, to: rows.at(-1)!.publishedAt },
    months: [...new Set(rows.map((r) => r.publishedAt.toISOString().slice(0, 7)))],
    warnings: [],
    fields: ['publishedAt', 'views', 'likes', 'comments', 'shares', 'saves', 'follows', 'type'],
  };
}

function ok(data: ParsedExport, ms = 42): ParseFileResult {
  return { result: { ok: true, data }, ms };
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

function renderFlow() {
  return render(
    <ToastProvider>
      <NewReportFlow initialMonth="2026-09" maxMonth="2026-10" />
    </ToastProvider>,
  );
}

function fileInput(): HTMLInputElement {
  const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
  expect(inputs).toHaveLength(1);
  return inputs[0]!;
}

function chooseFile(name = 'Studio-Lumi-wrzesien-2026.csv', size = 2048): File {
  const file = new File(['x'.repeat(size)], name, { type: 'text/csv' });
  fireEvent.change(fileInput(), { target: { files: [file] } });
  return file;
}

async function uploadTo2(data: ParsedExport = september(31)) {
  parseMock.mockResolvedValueOnce(ok(data));
  const file = chooseFile();
  const heading = await screen.findByRole('heading', { level: 1, name: /Dopisz efekty|Raport:/ });
  return { file, heading };
}

/** Fokus przenosi efekt po renderze — po krokach asynchronicznych czekamy, aż się wykona. */
async function expectFocus(element: Element) {
  await waitFor(() => expect(document.activeElement).toBe(element));
}

function clickButton(name: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
}

function trackCalls(name: string) {
  return trackMock.mock.calls.filter(([event]) => event === name);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date('2026-10-12T10:00:00Z'));
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/nowy');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('krok 1 — wgranie', () => {
  it('pokazuje nagłówek z miesiącem, wybór pliku, linię prywatności i poradnik w nowej karcie', () => {
    renderFlow();
    expect(screen.getByRole('heading', { level: 1, name: 'Wgraj eksport za wrzesień' })).toBeTruthy();
    expect(screen.getByText('Krok 1 z 3')).toBeTruthy();
    expect(screen.getByText('Wgraj eksport z Meta Business Suite')).toBeTruthy();
    // Na telefonie CSS pokazuje tytuł bez przeciągania (EkranWgrywanie.html).
    expect(screen.getByText('Wybierz plik CSV').closest('.sd-upload__title')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Wybierz plik' })).toBeTruthy();
    expect(screen.getByText('Plik zostaje w Twojej przeglądarce. Nie wysyłamy go na serwer.')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Jak zrobić eksport? (otwiera się w nowej karcie)' });
    expect(link.getAttribute('href')).toBe('/poradniki/jak-zrobic-raport-z-instagrama-dla-klienta#eksport');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener');
    expect(fileInput().getAttribute('accept')).toBe('.csv,text/csv');
    expect(screen.getByRole('link', { name: 'Sedno, strona główna' }).getAttribute('href')).toBe('/');
  });

  it('zmiana miesiąca w pasku zmienia nagłówek; następny miesiąc po bieżącym jest niedostępny', () => {
    renderFlow();
    clickButton('Następny miesiąc');
    expect(screen.getByRole('heading', { level: 1, name: 'Wgraj eksport za październik' })).toBeTruthy();
    const next = screen.getByRole('button', { name: 'Następny miesiąc' });
    expect(next.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(next);
    expect(screen.getByRole('heading', { level: 1, name: 'Wgraj eksport za październik' })).toBeTruthy();
  });

  it('w trakcie czytania pokazuje licznik publikacji (aria-live) i pasek postępu', async () => {
    let finish: (value: ParseFileResult) => void = () => {};
    parseMock.mockImplementationOnce((_file, opts) => {
      opts?.onProgress?.(12, 31);
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    renderFlow();
    chooseFile();
    const status = await screen.findByText('Czytam plik: 12 z 31 publikacji');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(
      screen.getByRole('progressbar', { name: 'Postęp wczytywania pliku' }).getAttribute('aria-valuenow'),
    ).toBe('39');
    expect(screen.getByText('Plik zostaje w Twojej przeglądarce. Nie wysyłamy go na serwer.')).toBeTruthy();
    await expectFocus(screen.getByRole('heading', { level: 1 }));
    await act(async () => finish(ok(september(31))));
    expect(await screen.findByRole('heading', { level: 1, name: 'Dopisz efekty' })).toBeTruthy();
  });

  it('błąd pliku: przyczyna i naprawa w polu wgrywania, ogłoszona czytnikom, zdarzenie tylko z kodem', async () => {
    parseMock.mockResolvedValueOnce({ result: { ok: false, error: { code: 'E_NOT_CSV' } }, ms: 0 });
    renderFlow();
    chooseFile('raport.xlsx');
    expect(await screen.findByText('To nie jest plik CSV')).toBeTruthy();
    expect(screen.getByText('Wgraj plik z rozszerzeniem .csv pobrany z Meta Business Suite.')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe(
      'To nie jest plik CSV. Wgraj plik z rozszerzeniem .csv pobrany z Meta Business Suite.',
    );
    expect(screen.getByRole('button', { name: 'Wybierz inny plik' })).toBeTruthy();
    expect(trackMock).toHaveBeenCalledWith('csv_error', { code: 'E_NOT_CSV' });
  });

  it('za duży plik (wiersze) ma własny komunikat', async () => {
    parseMock.mockResolvedValueOnce({
      result: { ok: false, error: { code: 'E_TOO_BIG', reason: 'rows' } },
      ms: 0,
    });
    renderFlow();
    chooseFile();
    expect(await screen.findByText('Plik ma więcej niż 20 000 wierszy')).toBeTruthy();
  });
});

describe('wczytanie pliku', () => {
  it('przechodzi do kroku 2 z chipem pliku, komunikatem sukcesu i fokusem na nagłówku', async () => {
    renderFlow();
    const { file, heading } = await uploadTo2(september(31));
    expect(heading.textContent).toBe('Dopisz efekty');
    await expectFocus(heading);
    expect(screen.getByText('Krok 2 z 3')).toBeTruthy();
    expect(screen.getByText('Studio-Lumi-wrzesien-2026.csv')).toBeTruthy();
    expect(screen.getByText('2 KB')).toBeTruthy();
    expect(screen.getByText('Wczytano 31 publikacji z września')).toBeTruthy();
    expect(
      screen.getByText('Okres 1–30 września 2026. Teraz dopisz trzy liczby z panelu profesjonalnego.'),
    ).toBeTruthy();
    // Pierwsza próba zawsze bez zapamiętanego mapowania.
    expect(parseMock).toHaveBeenCalledTimes(1);
    expect(parseMock.mock.calls[0]![0]).toBe(file);
    expect(parseMock.mock.calls[0]![1]?.mapping).toBeUndefined();
  });

  it.each([
    [1, 'Wczytano 1 publikację z września'],
    [3, 'Wczytano 3 publikacje z września'],
    [5, 'Wczytano 5 publikacji z września'],
    [22, 'Wczytano 22 publikacje z września'],
    [25, 'Wczytano 25 publikacji z września'],
  ])('odmienia liczbę publikacji: %i', async (n, text) => {
    renderFlow();
    await uploadTo2(september(n));
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('csv_parsed niesie wyłącznie liczby: wiersze, miesiące i czas', async () => {
    renderFlow();
    await uploadTo2(september(31));
    const calls = trackCalls('csv_parsed');
    expect(calls).toHaveLength(1);
    const props = calls[0]![1] as Record<string, unknown>;
    expect(props).toEqual({ rows: 31, months: 1, ms: 42 });
    expect(Object.values(props).every((v) => typeof v === 'number')).toBe(true);
  });

  it('csv_parsed: liczba miesięcy przycięta do granicy schematu zdarzenia (120), żeby zdarzenie nie przepadło', async () => {
    const data = september(3);
    renderFlow();
    await uploadTo2({ ...data, months: Array.from({ length: 130 }, (_, i) => addMonths('2016-01', i)) });
    expect(trackCalls('csv_parsed')).toEqual([['csv_parsed', { rows: 3, months: 120, ms: 42 }]]);
  });

  it('„Wgraj inny plik” wczytuje nowy plik i zostawia wpisane dane', async () => {
    renderFlow();
    await uploadTo2(september(31));
    fireEvent.change(screen.getByLabelText('Nazwa klienta'), { target: { value: 'Studio Lumi' } });
    expect(screen.getByRole('button', { name: 'Wgraj inny plik' })).toBeTruthy();
    parseMock.mockResolvedValueOnce(ok(september(5)));
    chooseFile('pelny.csv');
    expect(await screen.findByText('Wczytano 5 publikacji z września')).toBeTruthy();
    expect(screen.getByText('pelny.csv')).toBeTruthy();
    expect((screen.getByLabelText('Nazwa klienta') as HTMLInputElement).value).toBe('Studio Lumi');
  });
});

describe('mapowanie kolumn', () => {
  const longHeader = `Bardzo długi nagłówek kolumny ${'x'.repeat(60)}`;
  const missing: ParseFileResult = {
    result: {
      ok: false,
      error: {
        code: 'E_MISSING_COLUMNS',
        missing: ['views'],
        headers: ['Data', 'Odsłony', 'Opis', longHeader],
      },
    },
    ms: 5,
  };

  it('E_MISSING_COLUMNS → „Przypisz kolumny” → walidacja → ponowna próba z mapowaniem → krok 2', async () => {
    parseMock.mockResolvedValueOnce(missing).mockResolvedValueOnce(ok(september(4), 30));
    renderFlow();
    const file = chooseFile();

    expect(await screen.findByText('To nie jest eksport treści')).toBeTruthy();
    expect(
      screen.getByText(
        'W pliku brakuje kolumny „Wyświetlenia”. Pobierz eksport z zakładki Treści albo przypisz kolumny ręcznie.',
      ),
    ).toBeTruthy();
    expect(trackMock).toHaveBeenCalledWith('csv_error', { code: 'E_MISSING_COLUMNS' });
    clickButton('Przypisz kolumny ręcznie');

    const heading = await screen.findByRole('heading', { level: 1, name: 'Przypisz kolumny' });
    await expectFocus(heading);
    const date = screen.getByLabelText('Czas publikacji') as HTMLSelectElement;
    const views = screen.getByLabelText('Wyświetlenia') as HTMLSelectElement;
    expect([...date.options].map((o) => o.textContent)).toEqual([
      '— wybierz kolumnę —',
      'Data',
      'Odsłony',
      'Opis',
      `${longHeader.slice(0, 59)}…`,
    ]);
    expect(date.options[4]!.value).toBe(longHeader);

    // Nic nie wybrano: błąd przy pierwszym polu, powiązany przez aria-describedby, fokus na nim.
    clickButton('Wczytaj z tymi kolumnami');
    expect(date.getAttribute('aria-invalid')).toBe('true');
    const dateError = document.getElementById(date.getAttribute('aria-describedby')!);
    expect(dateError?.textContent).toBe('Wybierz kolumnę dla pola „Czas publikacji”.');
    await expectFocus(date);

    // Ta sama kolumna dwa razy.
    fireEvent.change(date, { target: { value: 'Data' } });
    fireEvent.change(views, { target: { value: 'Data' } });
    clickButton('Wczytaj z tymi kolumnami');
    expect(views.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(views.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Czas publikacji i wyświetlenia muszą być w dwóch różnych kolumnach. Wybierz inną kolumnę.',
    );
    expect(parseMock).toHaveBeenCalledTimes(1);

    fireEvent.change(views, { target: { value: 'Odsłony' } });
    clickButton('Wczytaj z tymi kolumnami');
    expect(await screen.findByRole('heading', { level: 1, name: 'Dopisz efekty' })).toBeTruthy();
    expect(parseMock).toHaveBeenCalledTimes(2);
    expect(parseMock.mock.calls[1]![0]).toBe(file);
    expect(parseMock.mock.calls[1]![1]?.mapping).toEqual({ Data: 'publishedAt', Odsłony: 'views' });
    // Wybór zapamiętany w tej przeglądarce (tylko nagłówki i nazwy pól).
    expect(JSON.parse(window.localStorage.getItem(COLUMN_MAPPING_KEY)!)).toEqual({
      Data: 'publishedAt',
      Odsłony: 'views',
    });
    expect(trackCalls('csv_parsed')[0]![1]).toEqual({ rows: 4, months: 1, ms: 30 });
  });

  it('kolumna bez wartości pola: błąd przy polu i fokus na nim', async () => {
    parseMock.mockResolvedValueOnce(missing).mockResolvedValueOnce({
      result: {
        ok: false,
        error: { code: 'E_MISSING_COLUMNS', missing: ['publishedAt'], headers: ['Data'] },
      },
      ms: 3,
    });
    renderFlow();
    chooseFile();
    await screen.findByText('To nie jest eksport treści');
    clickButton('Przypisz kolumny ręcznie');
    const date = (await screen.findByLabelText('Czas publikacji')) as HTMLSelectElement;
    fireEvent.change(date, { target: { value: 'Opis' } });
    fireEvent.change(screen.getByLabelText('Wyświetlenia'), { target: { value: 'Odsłony' } });
    clickButton('Wczytaj z tymi kolumnami');
    await waitFor(() => expect(date.getAttribute('aria-invalid')).toBe('true'));
    expect(document.getElementById(date.getAttribute('aria-describedby')!)?.textContent).toBe(
      'W kolumnie „Opis” nie ma wartości pola „Czas publikacji”. Wybierz inną kolumnę.',
    );
    await expectFocus(date);
    expect(window.localStorage.getItem(COLUMN_MAPPING_KEY)).toBeNull();
  });

  it('zapamiętane mapowanie trafia do parsera dopiero po E_MISSING_COLUMNS', async () => {
    window.localStorage.setItem(COLUMN_MAPPING_KEY, JSON.stringify({ Odsłony: 'views', Inna: 'likes' }));
    parseMock.mockResolvedValueOnce(missing).mockResolvedValueOnce(ok(september(3)));
    renderFlow();
    chooseFile();
    expect(await screen.findByRole('heading', { level: 1, name: 'Dopisz efekty' })).toBeTruthy();
    expect(parseMock.mock.calls[0]![1]?.mapping).toBeUndefined();
    expect(parseMock.mock.calls[1]![1]?.mapping).toEqual({ Odsłony: 'views' });
    expect(trackCalls('csv_error')).toHaveLength(0);
  });
});

describe('brak publikacji w miesiącu', () => {
  it('pokazuje zakres pliku i przełącza na miesiąc z pliku bez ponownego czytania', async () => {
    const rows = [
      row('2026-05-20T10:00:00Z', 0),
      row('2026-06-10T10:00:00Z', 1),
      row('2026-07-10T10:00:00Z', 2),
      row('2026-08-01T10:00:00Z', 3),
      row('2026-08-30T10:00:00Z', 4),
    ];
    const data: ParsedExport = {
      rows,
      range: { from: rows[0]!.publishedAt, to: rows.at(-1)!.publishedAt },
      months: ['2026-05', '2026-06', '2026-07', '2026-08'],
      warnings: [],
      fields: ['publishedAt', 'views', 'type'],
    };
    parseMock.mockResolvedValueOnce(ok(data));
    renderFlow();
    chooseFile();

    expect(await screen.findByText('W pliku nie ma publikacji z września')).toBeTruthy();
    expect(screen.getByText('Plik obejmuje 20 maja – 30 sierpnia 2026.')).toBeTruthy();
    const alert = screen
      .getByText('W pliku nie ma publikacji z września')
      .closest('.sd-alert') as HTMLElement;
    expect(alert.getAttribute('role')).toBe('alert');
    const offered = within(alert)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(offered).toEqual([
      'Przełącz na Sierpień 2026',
      'Przełącz na Lipiec 2026',
      'Przełącz na Czerwiec 2026',
      'Wybierz inny plik',
    ]);
    expect(trackCalls('csv_error')).toEqual([['csv_error', { code: 'E_NO_ROWS_IN_MONTH' }]]);

    clickButton('Przełącz na Sierpień 2026');
    const heading = await screen.findByRole('heading', { level: 1, name: 'Dopisz efekty' });
    await expectFocus(heading);
    expect(screen.getByText('Wczytano 2 publikacje z sierpnia')).toBeTruthy();
    expect(parseMock).toHaveBeenCalledTimes(1);
    // Zmiana miesiąca po wczytaniu nie wysyła kolejnych zdarzeń błędu.
    clickButton('Następny miesiąc');
    expect(await screen.findByText('W pliku nie ma publikacji z września')).toBeTruthy();
    expect(trackCalls('csv_error')).toHaveLength(1);
  });
});

describe('krok 2 — efekty', () => {
  it('od 1024 px: nagłówek z klientem, lista kroków i podgląd na żywo, który zmienia się z polami', async () => {
    setViewport({ phone: false, wide: true });
    renderFlow();
    await uploadTo2(september(31));
    expect(screen.getByRole('heading', { level: 1, name: 'Raport: nowy klient, wrzesień' })).toBeTruthy();
    const steps = screen.getByRole('list', { name: 'Kroki raportu' });
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['1. Eksport wczytany', '2. Efekty i komentarz', '3. Podgląd i PDF']);
    expect(within(steps).getAllByRole('listitem')[1]!.getAttribute('aria-current')).toBe('step');

    const preview = screen.getByRole('complementary', { name: 'Podgląd dla klienta' });
    expect(within(preview).getByText('dla: Nazwa klienta')).toBeTruthy();
    expect(trackCalls('report_previewed')).toEqual([['report_previewed', { mode: 'anon' }]]);

    fireEvent.change(screen.getByLabelText('Kliknięcia „Zarezerwuj”'), { target: { value: '23' } });
    expect(
      within(preview).getByRole('heading', { level: 2, name: '23 osoby chciały się umówić' }),
    ).toBeTruthy();
    expect((screen.getByLabelText('Tytuł raportu') as HTMLInputElement).value).toBe(
      '23 osoby chciały się umówić',
    );

    fireEvent.change(screen.getByLabelText('Nazwa klienta'), { target: { value: 'Studio Lumi' } });
    expect(screen.getByRole('heading', { level: 1, name: 'Raport: Studio Lumi, wrzesień' })).toBeTruthy();
    expect(within(preview).getByText('dla: Studio Lumi')).toBeTruthy();

    // Własny tytuł i powrót do tytułu z liczb.
    fireEvent.change(screen.getByLabelText('Tytuł raportu'), { target: { value: 'Rekordowy wrzesień' } });
    expect(within(preview).getByRole('heading', { level: 2, name: 'Rekordowy wrzesień' })).toBeTruthy();
    clickButton('Przywróć tytuł z liczb');
    expect(
      within(preview).getByRole('heading', { level: 2, name: '23 osoby chciały się umówić' }),
    ).toBeTruthy();
    await expectFocus(screen.getByLabelText('Tytuł raportu'));
    expect(screen.queryByRole('button', { name: 'Przywróć tytuł z liczb' })).toBeNull();

    // Liczba z poprzedniego miesiąca pod polem i w raporcie.
    fireEvent.change(screen.getByLabelText('Kliknięcia „Zarezerwuj” w sierpniu'), {
      target: { value: '17' },
    });
    const book = screen.getByLabelText('Kliknięcia „Zarezerwuj”');
    expect(document.getElementById(book.getAttribute('aria-describedby')!)?.textContent).toBe('sierpień: 17');
    expect(within(preview).getAllByText('sierpień: 17').length).toBeGreaterThan(0);

    // Opis karty efektów z miesiącem i niepoprawny wpis.
    expect(screen.getByText('Panel profesjonalny → Statystyki → Kontakty, wrzesień.')).toBeTruthy();
    const guide = screen.getByRole('link', { name: 'Gdzie znaleźć te liczby? (otwiera się w nowej karcie)' });
    expect(guide.getAttribute('href')).toBe('/poradniki/jak-zrobic-raport-z-instagrama-dla-klienta#efekty');
    expect(guide.getAttribute('target')).toBe('_blank');
    fireEvent.change(screen.getByLabelText('Kliknięcia „Zadzwoń”'), { target: { value: 'dziewięć' } });
    expect(screen.getByText('Wpisz liczbę cyframi, np. 9.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Przejdź do PDF' })).toBeTruthy();
  });

  it('na telefonie: „Dopisz efekty”, bez podglądu na żywo, „Zobacz raport” prowadzi do kroku 3', async () => {
    renderFlow();
    await uploadTo2();
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(trackCalls('report_previewed')).toHaveLength(0);
    const next = screen.getByRole('button', { name: 'Zobacz raport' });
    expect(next.className).toContain('sd-btn--block');
    expect(next.className).toContain('sd-btn--l');
    fireEvent.click(next);
    const heading = await screen.findByRole('heading', { level: 1, name: 'Raport dla klienta' });
    await expectFocus(heading);
    expect(screen.getByText('Krok 3 z 3')).toBeTruthy();
    expect(trackCalls('report_previewed')).toEqual([['report_previewed', { mode: 'anon' }]]);
    clickButton('Wróć do edycji');
    clickButton('Zobacz raport');
    // Raz na wczytany plik.
    expect(trackCalls('report_previewed')).toHaveLength(1);
  });

  it('kluczowa liczba: radio w grupie z legendą, domyślnie największy efekt, pusta liczba niedostępna', async () => {
    renderFlow();
    await uploadTo2(september(31));
    const group = screen.getByRole('group', { name: 'Kluczowa liczba raportu' });
    expect(group.tagName).toBe('FIELDSET');
    fireEvent.change(screen.getByLabelText('Kliknięcia „Zarezerwuj”'), { target: { value: '23' } });
    fireEvent.change(screen.getByLabelText('Kliknięcia „Zadzwoń”'), { target: { value: '30' } });

    const radio = (name: RegExp) => within(group).getByRole('radio', { name }) as HTMLInputElement;
    expect(radio(/^„Zadzwoń” \(30\)/).checked).toBe(true);
    expect(radio(/^„Zarezerwuj” \(23\)/).checked).toBe(false);
    expect(
      radio(/^„Zadzwoń”/)
        .closest('label')
        ?.querySelector('.sd-badge--pen'),
    ).not.toBeNull();

    fireEvent.click(radio(/^„Zarezerwuj”/));
    expect(radio(/^„Zarezerwuj”/).checked).toBe(true);
    expect((screen.getByLabelText('Tytuł raportu') as HTMLInputElement).value).toBe(
      '23 osoby chciały się umówić',
    );

    const directions = radio(/^„Wyznacz trasę”/);
    expect(directions.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(directions.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Kliknięcia bez liczby nie mogą być kluczową liczbą. Najpierw wpisz liczbę powyżej.',
    );
    fireEvent.click(directions);
    expect(radio(/^„Zarezerwuj”/).checked).toBe(true);
    expect(directions.checked).toBe(false);

    fireEvent.click(radio(/^Wyświetlenia/));
    expect(radio(/^Wyświetlenia/).checked).toBe(true);
    expect((screen.getByLabelText('Tytuł raportu') as HTMLInputElement).value).toMatch(
      /wyświetleń we wrześniu$/,
    );
    expect(screen.getByText('Ta liczba zostanie zakreślona na górze raportu.')).toBeTruthy();
  });

  it('bez kliknięć zakreślone są wyświetlenia i edytor o tym mówi', async () => {
    renderFlow();
    await uploadTo2(september(31));
    const group = screen.getByRole('group', { name: 'Kluczowa liczba raportu' });
    expect((within(group).getByRole('radio', { name: /^Wyświetlenia/ }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(
      screen.getByText('Bez kliknięć zakreślone są wyświetlenia. Wpisz liczby powyżej, żeby to zmienić.'),
    ).toBeTruthy();
  });

  it('zakreślacz: niedostępny bez zaznaczenia, zakreśla zaznaczony fragment, „Usuń zakreślenie”', async () => {
    renderFlow();
    await uploadTo2(september(31));
    const worked = screen.getByLabelText('Co zadziałało') as HTMLTextAreaElement;
    expect(worked.getAttribute('placeholder')).toBe('np. 11 rolek, 10 postów, 10 relacji');
    const text = 'Najwięcej rezerwacji przyszło po rolkach z metamorfozami brwi.';
    fireEvent.change(worked, { target: { value: text } });

    const markButton = screen.getByRole('button', { name: 'Zakreśl zaznaczony fragment' });
    expect(markButton.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(markButton.getAttribute('aria-describedby')!)?.textContent).toContain(
      'Zaznacz w polu „Co zadziałało”',
    );
    fireEvent.click(markButton);
    expect(screen.queryByText(/^Zakreślone:/)).toBeNull();
    // Region ogłoszeń istnieje przed zakreśleniem (pusty), więc wynik zostanie przeczytany.
    const announcer = screen.getAllByRole('status').find((el) => el.classList.contains('sd-visually-hidden'));
    expect(announcer?.textContent).toBe('');

    const start = text.indexOf('rolkach');
    worked.focus();
    worked.setSelectionRange(start, start + 'rolkach z metamorfozami brwi'.length);
    fireEvent.mouseUp(worked);
    expect(markButton.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(markButton);
    expect(announcer?.textContent).toBe('Zakreślone: „rolkach z metamorfozami brwi”');
    expect(
      screen.getByText('Zakreślone: „rolkach z metamorfozami brwi”', { selector: '[aria-hidden="true"]' }),
    ).toBeTruthy();

    clickButton('Zobacz raport');
    await screen.findByRole('heading', { level: 1, name: 'Raport dla klienta' });
    const marks = document.querySelectorAll('mark.sd-mark');
    expect([...marks].map((m) => m.textContent)).toEqual(['rolkach z metamorfozami brwi']);

    clickButton('Wróć do edycji');
    await screen.findByRole('heading', { level: 1, name: 'Dopisz efekty' });
    clickButton('Usuń zakreślenie');
    expect(screen.queryByText(/^Zakreślone:/)).toBeNull();
    await expectFocus(screen.getByRole('button', { name: 'Zakreśl zaznaczony fragment' }));
  });

  it('pola komentarza: „Plan na październik” i informacja o emoji', async () => {
    renderFlow();
    await uploadTo2();
    expect(screen.getByLabelText('Plan na październik')).toBeTruthy();
    expect(
      screen.getByText('Emoji nie pojawią się w raporcie, bo kroje pisma raportu ich nie mają.'),
    ).toBeTruthy();
    // Obietnica z podpowiedzi: raport nie ma emoji.
    fireEvent.change(screen.getByLabelText('Co zadziałało'), {
      target: { value: 'Rolki 🔥 z metamorfozami ✨ działały.' },
    });
    clickButton('Zobacz raport');
    await screen.findByRole('heading', { level: 1, name: 'Raport dla klienta' });
    const report = document.querySelector('.sd-report')!;
    expect(report.textContent).toContain('Rolki z metamorfozami działały.');
    expect(report.textContent).not.toMatch(/🔥|✨/u);
  });

  it('niepełny miesiąc: ostrzeżenie z „Wgraj pełny plik” i „Zostaw przypis”, przypis zostaje w raporcie', async () => {
    renderFlow();
    await uploadTo2(september(20, 27));
    expect(screen.getByText('Eksport kończy się 27 września')).toBeTruthy();
    expect(
      screen.getByText(
        'Porównanie z sierpniem obejmie 27 dni, nie 30. Wgraj pełny plik albo zostaw przypis w raporcie.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Wgraj pełny plik' })).toBeTruthy();
    clickButton('Zostaw przypis');
    const kept = screen.getByText('Przypis o niepełnym miesiącu zostaje w raporcie.');
    await expectFocus(kept);
    expect(screen.queryByText('Eksport kończy się 27 września')).toBeNull();
    clickButton('Zobacz raport');
    await screen.findByRole('heading', { level: 1, name: 'Raport dla klienta' });
    expect(screen.getByText(/Dane z września obejmują 27 z 30 dni\./)).toBeTruthy();
  });

  it('plik zaczyna się w połowie poprzedniego miesiąca: informacja i pole na wyświetlenia', async () => {
    const data = september(10);
    const late = row('2026-08-13T10:00:00Z', 0);
    const partial: ParsedExport = {
      ...data,
      rows: [late, ...data.rows],
      range: { from: late.publishedAt, to: data.range.to },
      months: ['2026-08', '2026-09'],
    };
    renderFlow();
    await uploadTo2(partial);
    expect(screen.getByText('Plik zaczyna się 13 sierpnia 2026')).toBeTruthy();
    expect(
      screen.getByText(
        'Dlatego sierpień z pliku nie trafi do porównania. Wpisz liczby z sierpnia niżej albo wgraj eksport od 1 sierpnia.',
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('Wyświetlenia w sierpniu')).toBeTruthy();
    expect(screen.getByText('Dodaj liczby z sierpnia (nieobowiązkowe)').closest('details')?.open).toBe(true);
  });
});

describe('krok 2 — poprawki z przeglądu', () => {
  it('pusty tytuł wraca do tytułu z liczb bez zabierania fokusu następnemu polu', async () => {
    renderFlow();
    await uploadTo2(september(31));
    fireEvent.change(screen.getByLabelText('Kliknięcia „Zarezerwuj”'), { target: { value: '23' } });
    const title = screen.getByLabelText('Tytuł raportu') as HTMLInputElement;
    act(() => title.focus());
    fireEvent.change(title, { target: { value: '' } });
    const worked = screen.getByLabelText('Co zadziałało');
    act(() => worked.focus());
    expect(title.value).toBe('23 osoby chciały się umówić');
    await act(async () => {});
    expect(document.activeElement).toBe(worked);
  });

  it('zmiana miesiąca: liczby wpisane ręcznie zostają przy swoich miesiącach', async () => {
    renderFlow();
    await uploadTo2(between('2026-08-01', '2026-09-30'));
    fireEvent.change(screen.getByLabelText('Kliknięcia „Zarezerwuj”'), { target: { value: '23' } });
    fireEvent.change(screen.getByLabelText('Kliknięcia „Zarezerwuj” w sierpniu'), {
      target: { value: '17' },
    });
    expect(screen.getAllByText('sierpień: 17').length).toBeGreaterThan(0);

    clickButton('Poprzedni miesiąc');
    await screen.findByText(/^Wczytano \d+ publikacj\S+ z sierpnia$/);
    // Liczby wpisane za sierpień są efektami sierpnia, a pola lipca są puste.
    expect((screen.getByLabelText('Kliknięcia „Zarezerwuj”') as HTMLInputElement).value).toBe('17');
    expect((screen.getByLabelText('Kliknięcia „Zarezerwuj” w lipcu') as HTMLInputElement).value).toBe('');
    clickButton('Zobacz raport');
    await screen.findByRole('heading', { level: 1, name: 'Raport dla klienta' });
    expect(screen.getByRole('heading', { level: 2, name: '17 osób chciało się umówić' })).toBeTruthy();
    expect(screen.queryByText('lipiec: 17')).toBeNull();

    // Z powrotem na wrzesień: 23 i porównanie „sierpień: 17” wracają.
    clickButton('Wróć do edycji');
    clickButton('Następny miesiąc');
    await screen.findByText(/^Wczytano \d+ publikacj\S+ z września$/);
    expect((screen.getByLabelText('Kliknięcia „Zarezerwuj”') as HTMLInputElement).value).toBe('23');
    expect(screen.getAllByText('sierpień: 17').length).toBeGreaterThan(0);
  });

  it('pola M−1 otwierają się, gdy po zmianie miesiąca plik zaczyna się w połowie M−1', async () => {
    renderFlow();
    await uploadTo2(between('2026-07-20', '2026-09-30'));
    // Wrzesień: plik obejmuje cały sierpień — sekcja zamknięta, bez pola wyświetleń.
    expect(screen.getByText('Dodaj liczby z sierpnia (nieobowiązkowe)').closest('details')?.open).toBe(false);
    expect(screen.queryByLabelText('Wyświetlenia w sierpniu')).toBeNull();
    clickButton('Poprzedni miesiąc');
    expect(await screen.findByText('Plik zaczyna się 20 lipca 2026')).toBeTruthy();
    expect(screen.getByText('Dodaj liczby z lipca (nieobowiązkowe)').closest('details')?.open).toBe(true);
    expect(screen.getByLabelText('Wyświetlenia w lipcu')).toBeTruthy();
  });

  it('plik bez wyświetleń: podpowiedź nie twierdzi, że zakreślone są wyświetlenia', async () => {
    const data = september(31);
    const noViews: ParsedExport = {
      ...data,
      rows: data.rows.map((r) => ({ ...r, views: null, reach: 900 })),
      fields: ['publishedAt', 'reach', 'likes', 'comments', 'shares', 'saves', 'type'],
    };
    renderFlow();
    await uploadTo2(noViews);
    const group = screen.getByRole('group', { name: 'Kluczowa liczba raportu' });
    expect(
      within(group)
        .getByRole('radio', { name: /^Wyświetlenia/ })
        .getAttribute('aria-disabled'),
    ).toBe('true');
    expect(
      screen.getByText('Raport nie ma jeszcze kluczowej liczby. Wpisz liczbę kliknięć powyżej.'),
    ).toBeTruthy();
    expect(screen.queryByText(/zakreślone są wyświetlenia/)).toBeNull();
  });

  it('„Wgraj pełny plik” otwiera okno wyboru pliku', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    renderFlow();
    await uploadTo2(september(20, 27));
    clickButton('Wgraj pełny plik');
    expect(click).toHaveBeenCalledTimes(1);
    expect(click.mock.contexts[0]).toBe(fileInput());
    click.mockRestore();
  });
});

describe('krok 3 — PDF', () => {
  it('bez nazwy klienta „Pobierz PDF” jest niedostępny z wyjaśnieniem i prowadzi do pola', async () => {
    renderFlow();
    await uploadTo2();
    clickButton('Zobacz raport');
    const pdf = await screen.findByRole('button', { name: 'Pobierz PDF' });
    expect(pdf.getAttribute('aria-disabled')).toBe('true');
    expect(pdf.hasAttribute('disabled')).toBe(false);
    expect(document.getElementById(pdf.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Wpisz nazwę klienta w kroku 2, żeby pobrać PDF.',
    );
    expect(screen.getByText('Link do raportu i historia raportów będą w planie Solo.')).toBeTruthy();
    expect(screen.getByText('Wkrótce')).toBeTruthy();

    fireEvent.click(pdf);
    expect(pdfMock).not.toHaveBeenCalled();
    await screen.findByRole('heading', { level: 1, name: 'Dopisz efekty' });
    const client = screen.getByLabelText('Nazwa klienta');
    await expectFocus(client);
    expect(client.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Wpisz nazwę klienta. Bez niej nie pobierzesz PDF.')).toBeTruthy();
    fireEvent.change(client, { target: { value: 'Studio Lumi' } });
    expect(screen.queryByText('Wpisz nazwę klienta. Bez niej nie pobierzesz PDF.')).toBeNull();
  });

  it('nazwa klienta z samych emoji nie wystarcza (raport usuwa emoji)', async () => {
    renderFlow();
    await uploadTo2();
    fireEvent.change(screen.getByLabelText('Nazwa klienta'), { target: { value: '🌸 ✨' } });
    clickButton('Zobacz raport');
    const pdf = await screen.findByRole('button', { name: 'Pobierz PDF' });
    expect(pdf.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('dla: Nazwa klienta')).toBeTruthy();
    fireEvent.click(pdf);
    expect(pdfMock).not.toHaveBeenCalled();
    await screen.findByRole('heading', { level: 1, name: 'Dopisz efekty' });
    expect(screen.getByText('Wpisz nazwę klienta. Bez niej nie pobierzesz PDF.')).toBeTruthy();
  });

  it('pobranie PDF: toast „PDF pobrany”, komunikat o gotowym raporcie i zdarzenie bez treści', async () => {
    pdfMock.mockResolvedValueOnce('raport-studio-lumi-2026-09.pdf');
    renderFlow();
    await uploadTo2();
    fireEvent.change(screen.getByLabelText('Twoja nazwa albo marka'), { target: { value: 'Kadr Social' } });
    fireEvent.change(screen.getByLabelText('Nazwa klienta'), { target: { value: 'Studio Lumi' } });
    clickButton('Zobacz raport');
    fireEvent.click(await screen.findByRole('button', { name: 'Pobierz PDF' }));

    expect(await screen.findByText('PDF pobrany')).toBeTruthy();
    expect(screen.getByText('Raport dla Studio Lumi jest gotowy')).toBeTruthy();
    expect(screen.getByText('PDF jest w Pobranych. Możesz wysłać go klientowi.')).toBeTruthy();
    expect(pdfMock).toHaveBeenCalledTimes(1);
    const report = pdfMock.mock.calls[0]![0] as ReportData;
    expect(report.client).toEqual({ name: 'Studio Lumi' });
    expect(report.author).toEqual({ name: 'Kadr Social' });
    expect(report.branding).toBe('sedno-footer');
    expect(report.period).toBe('2026-09');
    const calls = trackCalls('pdf_downloaded');
    expect(calls).toHaveLength(1);
    expect(calls[0]![1]).toStrictEqual({ mode: 'anon', branding: 'sedno-footer' });
  });

  it('nieudany PDF: przyczyna i naprawa', async () => {
    pdfMock.mockRejectedValueOnce(new Error('font'));
    renderFlow();
    await uploadTo2();
    fireEvent.change(screen.getByLabelText('Nazwa klienta'), { target: { value: 'Studio Lumi' } });
    clickButton('Zobacz raport');
    fireEvent.click(await screen.findByRole('button', { name: 'Pobierz PDF' }));
    expect(await screen.findByText('Nie udało się utworzyć PDF')).toBeTruthy();
    expect(screen.getByText('Odśwież stronę i spróbuj ponownie.')).toBeTruthy();
    expect(trackCalls('pdf_downloaded')).toHaveLength(0);
  });
});

describe('wejście ze strony głównej', () => {
  it('?src=hero: zdarzenie landing_cta_click i adres bez parametru', async () => {
    window.history.replaceState(null, '', '/nowy?src=hero&utm=x');
    renderFlow();
    await waitFor(() => expect(window.location.search).toBe('?utm=x'));
    expect(window.location.pathname).toBe('/nowy');
    expect(trackCalls('landing_cta_click')).toEqual([['landing_cta_click', { cta: 'hero' }]]);
  });

  it('adres zmienia obsługa historii routera Next.js, podpinana w efekcie przodka (po efektach strony)', async () => {
    // Jak next/dist/client/components/app-router.js: router podmienia history.replaceState w swoim useEffect,
    // który przy pierwszym renderze działa po efektach dzieci. Natywne wywołanie przed podmianą kasuje stan
    // wpisu historii routera — powrót „Wstecz” na /nowy nie odświeżyłby wtedy widoku.
    window.history.replaceState(null, '', '/nowy?src=pricing');
    const routed: unknown[] = [];
    function FakeRouter({ children }: { children: ReactNode }) {
      useEffect(() => {
        const original = window.history.replaceState;
        window.history.replaceState = function replaceState(data, unused, url) {
          routed.push(url);
          original.call(window.history, data, unused, url);
        };
        return () => {
          window.history.replaceState = original;
        };
      }, []);
      return children;
    }
    render(
      <FakeRouter>
        <ToastProvider>
          <NewReportFlow initialMonth="2026-09" maxMonth="2026-10" />
        </ToastProvider>
      </FakeRouter>,
    );
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(routed).toEqual(['/nowy']);
    expect(trackCalls('landing_cta_click')).toEqual([['landing_cta_click', { cta: 'pricing' }]]);
  });

  it('nieznane źródło nie trafia do analityki, ale znika z adresu', async () => {
    window.history.replaceState(null, '', '/nowy?src=<script>');
    renderFlow();
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(trackCalls('landing_cta_click')).toHaveLength(0);
  });
});

describe('pamięć przeglądarki', () => {
  it('zapisuje wyłącznie nazwę autora i mapowanie kolumn; nazwa autora wraca po odświeżeniu', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    parseMock
      .mockResolvedValueOnce({
        result: {
          ok: false,
          error: { code: 'E_MISSING_COLUMNS', missing: ['views'], headers: ['Data', 'Odsłony'] },
        },
        ms: 1,
      })
      .mockResolvedValueOnce(ok(september(31)));
    const { unmount } = renderFlow();
    chooseFile();
    await screen.findByText('To nie jest eksport treści');
    clickButton('Przypisz kolumny ręcznie');
    fireEvent.change(await screen.findByLabelText('Czas publikacji'), { target: { value: 'Data' } });
    fireEvent.change(screen.getByLabelText('Wyświetlenia'), { target: { value: 'Odsłony' } });
    clickButton('Wczytaj z tymi kolumnami');
    await screen.findByRole('heading', { level: 1, name: 'Dopisz efekty' });

    fireEvent.change(screen.getByLabelText('Twoja nazwa albo marka'), { target: { value: 'Kadr Social' } });
    fireEvent.change(screen.getByLabelText('Nazwa klienta'), { target: { value: 'Studio Lumi' } });
    fireEvent.change(screen.getByLabelText('Kliknięcia „Zarezerwuj”'), { target: { value: '23' } });
    fireEvent.change(screen.getByLabelText('Co zadziałało'), { target: { value: 'Rolki.' } });
    clickButton('Zobacz raport');
    await screen.findByRole('heading', { level: 1, name: 'Raport dla klienta' });

    const keys = new Set(setItem.mock.calls.map(([key]) => key));
    expect([...keys].sort()).toEqual(['sedno.authorName', COLUMN_MAPPING_KEY].sort());
    expect(window.sessionStorage.length).toBe(0);
    expect(window.localStorage.getItem('sedno.authorName')).toBe('Kadr Social');
    // Adres strony nie niesie danych.
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
    setItem.mockRestore();

    unmount();
    renderFlow();
    await uploadTo2();
    expect((screen.getByLabelText('Twoja nazwa albo marka') as HTMLInputElement).value).toBe('Kadr Social');
    expect((screen.getByLabelText('Nazwa klienta') as HTMLInputElement).value).toBe('');
  });
});

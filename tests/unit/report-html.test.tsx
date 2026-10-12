// @vitest-environment jsdom
/**
 * Raport HTML (<Report>): zawsze jasny, jedno zakreślenie, najwyżej jeden zakreślacz, „—” zamiast 0,
 * stała kolejność sekcji (PROMPT.md §11), stopka tylko przy sedno-footer, pisany bezosobowo.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Report } from '@/components/report/Report';
import { EXAMPLE_REPORT } from '@/lib/report/example';
import type { ReportData } from '@/lib/report/types';

afterEach(cleanup);

function report(overrides: Partial<ReportData> = {}): ReportData {
  return { ...structuredClone(EXAMPLE_REPORT), ...overrides };
}

/** Wszystkie warianty, które powinny przejść te same reguły. */
const VARIANTS: Record<string, ReportData> = {
  przykład: EXAMPLE_REPORT,
  'kluczowe wyświetlenia': report({
    keyMetric: 'views',
    actions: { book: 0, call: null, directions: 0 },
    headline: '12 480 wyświetleń we wrześniu',
  }),
  'bez poprzedniego miesiąca i przypisy': report({
    previous: undefined,
    flags: { metricChangeNote: true, incompleteDays: 27, inProgress: true },
  }),
  'branding autora, bez zakreślacza': report({ branding: 'author', commentMark: undefined }),
  'bez komentarza i planu': report({ commentWorked: undefined, commentMark: undefined, planNext: undefined }),
  // Spadek wyświetleń 11 000 → 10 000 (−9% m/m) i efektów: ma wyglądać tak samo spokojnie jak wzrost.
  spadek: report({
    summary: { ...EXAMPLE_REPORT.summary, views: 10_000 },
    actions: { book: 12, call: 3, directions: 4 },
    headline: '12 osób chciało się umówić',
    previous: {
      source: 'file',
      summary: { views: 11_000, follows: 70 },
      actions: { book: 17, call: 11, directions: 10 },
    },
  }),
};

function shell(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('.sd-report');
  if (!el) throw new Error('brak .sd-report');
  return el;
}

/** Słowa tekstu (litery Unicode), do sprawdzenia formy bezosobowej. */
function words(text: string): string[] {
  return text.split(/[^\p{L}]+/u).filter(Boolean);
}

const DIRECT_ADDRESS = new Set([
  'ty',
  'tobie',
  'ciebie',
  'cię',
  'ci',
  'twój',
  'twoja',
  'twoje',
  'twojego',
  'twojej',
  'twoich',
  'twoim',
  'twoimi',
  'pan',
  'pani',
  'pana',
  'panu',
  'panem',
  'panią',
  'państwo',
  'państwa',
]);

describe.each(Object.entries(VARIANTS))('Report: %s', (_, data) => {
  it('jest zawsze jasny i po polsku (sd-report, data-theme="light", lang="pl")', () => {
    const { container } = render(<Report data={data} />);
    const el = shell(container);
    expect(el.getAttribute('data-theme')).toBe('light');
    expect(el.getAttribute('lang')).toBe('pl');
  });

  it('ma dokładnie jedno zakreślenie i najwyżej jeden zakreślacz', () => {
    const { container } = render(<Report data={data} />);
    expect(container.querySelectorAll('.sd-circled')).toHaveLength(1);
    expect(container.querySelectorAll('.sd-circled__ring[aria-hidden="true"]')).toHaveLength(1);
    expect(container.querySelectorAll('.sd-mark').length).toBeLessThanOrEqual(1);
  });

  it('pisze bezosobowo: bez „Ty”, „Twój”, „Pan”, „Pani”', () => {
    const { container } = render(<Report data={data} />);
    const found = words(container.textContent ?? '').filter((w) =>
      DIRECT_ADDRESS.has(w.toLocaleLowerCase('pl-PL')),
    );
    expect(found).toEqual([]);
  });

  it('nie używa koloru ani strzałek do pokazania zmiany', () => {
    const { container } = render(<Report data={data} />);
    expect(container.textContent).not.toMatch(/[↑↓▲▼⬆⬇]/);
    expect(container.querySelector('[style*="color"]')).toBeNull();
  });
});

describe('Report: przykładowy raport', () => {
  it('ma treść z makiety EkranRaport.html', () => {
    const { container } = render(<Report data={EXAMPLE_REPORT} />);
    expect(screen.getByRole('heading', { level: 1, name: '23 osoby chciały się umówić' })).toBeTruthy();
    expect(screen.getByText('Co dał Instagram we wrześniu')).toBeTruthy();
    expect(screen.getByText('dla: Studio Lumi')).toBeTruthy();
    expect(screen.getByText('Wrzesień 2026')).toBeTruthy();
    expect(screen.getByText('Kadr Social')).toBeTruthy();
    const key = container.querySelector('.sd-key');
    expect(key?.querySelector('.sd-key__label')?.textContent?.trim()).toBe('Kliknięcia „Zarezerwuj”');
    expect(key?.querySelector('.sd-circled')?.textContent).toBe('23');
    expect(key?.querySelector('.sd-key__delta')?.textContent).toBe('sierpień: 17');
    const metrics = [...container.querySelectorAll('.sd-metric')].map((m) => [
      m.querySelector('.sd-metric__label')?.textContent,
      m.querySelector('.sd-metric__value')?.textContent,
      m.querySelector('.sd-metric__delta')?.textContent,
    ]);
    expect(metrics).toEqual([
      ['Zadzwoń', '9', 'sierpień: 11'],
      ['Wyznacz trasę', '14', 'sierpień: 10'],
    ]);
    expect(container.querySelector('.sd-mark')?.textContent).toBe('rolkach z metamorfozami brwi');
  });

  it('przekazuje szerokość kluczowej liczby do CSS (--key-em)', () => {
    const { container } = render(<Report data={EXAMPLE_REPORT} />);
    const box = container.querySelector<HTMLElement>('.sd-key')?.parentElement;
    expect(box?.style.getPropertyValue('--key-em')).toBe('1.18');
  });

  it('ikony przy liczbach są dekoracyjne', () => {
    const { container } = render(<Report data={EXAMPLE_REPORT} />);
    const icons = container.querySelectorAll('.sd-key svg.sd-icon, .sd-metric svg.sd-icon');
    expect(icons).toHaveLength(3);
    icons.forEach((icon) => expect(icon.getAttribute('aria-hidden')).toBe('true'));
  });

  it('słupki mają szerokość w % i liczby tekstem obok', () => {
    const { container } = render(<Report data={EXAMPLE_REPORT} />);
    const rows = [...container.querySelectorAll('.sd-r-bar')].map((row) => ({
      text: row.textContent,
      width: row.querySelector('i')?.style.width,
      prev: row.querySelector('i')?.classList.contains('prev'),
    }));
    expect(rows).toEqual([
      { text: 'Wyświetlenia12 480 +9% m/m', width: '100%', prev: false },
      { text: 'sierpień11 420', width: '92%', prev: true },
      { text: 'Nowi obserwujący64', width: '100%', prev: false },
      { text: 'sierpień51', width: '80%', prev: true },
    ]);
    container
      .querySelectorAll('.sd-r-bar i')
      .forEach((bar) => expect(bar.getAttribute('aria-hidden')).toBe('true'));
    container
      .querySelectorAll('.sd-r-bar > span:last-child')
      .forEach((v) => expect(v.classList).toContain('sd-num'));
  });

  it('sekcje w stałej kolejności (PROMPT.md §11)', () => {
    const { container } = render(<Report data={EXAMPLE_REPORT} />);
    const heading = (name: string) => screen.getByRole('heading', { level: 2, name });
    const order = [
      container.querySelector('.sd-r-brand'),
      screen.getByRole('heading', { level: 1 }),
      container.querySelector('.sd-key'),
      container.querySelector('.sd-metric'),
      heading('Co zadziałało'),
      container.querySelector('.sd-mark'),
      heading('Zasięg'),
      container.querySelector('.sd-r-bars'),
      heading('Plan na październik'),
      container.querySelector('p.sd-r-foot'),
      screen.getByRole('img', { name: 'Sedno' }),
    ];
    order.forEach((el) => expect(el).not.toBeNull());
    for (let i = 1; i < order.length; i += 1) {
      const prev = order[i - 1]!;
      const next = order[i]!;
      expect(prev.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING, `${i}`).toBeTruthy();
    }
  });

  it('przypis o źródle danych z pełnym zakresem dat', () => {
    const { container } = render(<Report data={EXAMPLE_REPORT} />);
    expect(container.querySelector('p.sd-r-foot')?.textContent).toBe(
      'Dane: eksport Meta Business Suite i panel profesjonalny Instagrama, 1–30 września 2026.',
    );
  });
});

describe('Report: poziomy nagłówków', () => {
  it('headingLevel=1: tytuł h1, sekcje h2', () => {
    render(<Report data={EXAMPLE_REPORT} headingLevel={1} />);
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([
      '23 osoby chciały się umówić',
    ]);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Co zadziałało',
      'Zasięg',
      'Plan na październik',
    ]);
    expect(screen.queryAllByRole('heading', { level: 3 })).toEqual([]);
  });

  it('headingLevel=2: tytuł h2, sekcje h3, bez h1', () => {
    render(<Report data={EXAMPLE_REPORT} headingLevel={2} />);
    expect(screen.queryAllByRole('heading', { level: 1 })).toEqual([]);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      '23 osoby chciały się umówić',
    ]);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Co zadziałało',
      'Zasięg',
      'Plan na październik',
    ]);
  });
});

describe('Report: warianty treści', () => {
  it('brak danych to „—”, a porównanie „Brak danych z sierpnia”', () => {
    const { container } = render(
      <Report data={report({ actions: { book: 23, call: null, directions: null }, previous: undefined })} />,
    );
    const values = [...container.querySelectorAll('.sd-metric__value')].map((v) => v.textContent);
    expect(values).toEqual(['—', '—']);
    const deltas = [...container.querySelectorAll('.sd-key__delta, .sd-metric__delta')].map(
      (d) => d.textContent,
    );
    expect(deltas).toEqual(['Brak danych z sierpnia', 'Brak danych z sierpnia', 'Brak danych z sierpnia']);
  });

  it('spadek: prawdziwy minus przy wyświetleniach, bez strzałek i bez koloru', () => {
    const { container } = render(<Report data={VARIANTS.spadek!} />);
    const bars = container.querySelector('.sd-r-bars')?.textContent ?? '';
    expect(bars).toContain('\u22129% m/m');
    expect(bars).not.toMatch(/-\d/);
  });

  it('kluczowa liczba bez danych: „—” w zakreśleniu, nigdy 0', () => {
    const { container } = render(
      <Report data={report({ keyMetric: 'call', actions: { book: 23, call: null, directions: 14 } })} />,
    );
    expect(container.querySelector('.sd-circled')?.textContent).toBe('—');
    expect(container.querySelector('.sd-key__delta')?.textContent).toBe('sierpień: 11');
  });

  it('bez zaznaczonego fragmentu nie ma zakreślacza', () => {
    const { container } = render(<Report data={report({ commentMark: undefined })} />);
    expect(container.querySelector('.sd-mark')).toBeNull();
    expect(screen.getByText(/Najwięcej rezerwacji przyszło po rolkach/)).toBeTruthy();
  });

  it('kluczowe wyświetlenia: zakreślona liczba wyświetleń, trzy liczby efektów, procent m/m', () => {
    const { container } = render(
      <Report
        data={report({
          keyMetric: 'views',
          actions: { book: 0, call: null, directions: 0 },
          headline: '12 480 wyświetleń we wrześniu',
        })}
      />,
    );
    expect(container.querySelector('.sd-circled')?.textContent).toBe('12 480');
    expect(container.querySelector('.sd-key__delta')?.textContent).toBe('sierpień: 11 420 +9% m/m');
    expect(container.querySelectorAll('.sd-metric')).toHaveLength(3);
    expect(container.querySelector('.sd-r-bars')?.textContent).not.toContain('m/m');
  });

  it('stopka „Przygotowano w” z logo Sedno tylko przy sedno-footer', () => {
    const { unmount } = render(<Report data={EXAMPLE_REPORT} />);
    const footer = screen.getByText('Przygotowano w', { exact: false });
    expect(within(footer).getByRole('img', { name: 'Sedno' })).toBeTruthy();
    unmount();

    const { container } = render(<Report data={report({ branding: 'author' })} />);
    expect(container.textContent).not.toContain('Przygotowano w');
    expect(screen.queryByRole('img', { name: 'Sedno' })).toBeNull();
  });

  it('przypisy: zmiana metryk, niepełny miesiąc, miesiąc w toku', () => {
    const { container } = render(
      <Report data={report({ flags: { metricChangeNote: true, incompleteDays: 27, inProgress: true } })} />,
    );
    const foot = container.querySelector('p.sd-r-foot')?.textContent ?? '';
    expect(foot).toContain('Od kwietnia 2025 r. Meta liczy wyświetlenia inaczej');
    expect(foot).toContain('Dane z września obejmują 27 z 30 dni.');
    expect(foot).toContain('Dane do 30 września.');
  });

  it('logo autora zastępuje awatar z inicjałami', () => {
    const { container } = render(
      <Report data={report({ author: { name: 'Kadr Social', logoUrl: 'https://example.com/logo.png' } })} />,
    );
    const img = screen.getByRole('img', { name: 'Kadr Social' });
    expect(img.getAttribute('src')).toBe('https://example.com/logo.png');
    expect(container.querySelector('.sd-avatar')).toBeNull();
  });

  it('awatar z inicjałami jest ukryty przed czytnikami (nazwa stoi obok)', () => {
    const { container } = render(<Report data={EXAMPLE_REPORT} />);
    const avatar = container.querySelector('.sd-avatar');
    expect(avatar?.textContent).toBe('KS');
    expect(avatar?.getAttribute('aria-hidden')).toBe('true');
  });

  it('bez nazwy autora nie ma awatara ani pustej nazwy', () => {
    const { container } = render(<Report data={report({ author: { name: '' } })} />);
    expect(container.querySelector('.sd-avatar')).toBeNull();
    expect(screen.getByText('dla: Studio Lumi')).toBeTruthy();
  });

  it('dodaje klasę z zewnątrz do kontenera raportu', () => {
    const { container } = render(<Report data={EXAMPLE_REPORT} className="extra" />);
    expect(shell(container).classList).toContain('extra');
  });
});

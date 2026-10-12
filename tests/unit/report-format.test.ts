/**
 * Model widoku raportu (lib/report/format.ts): porównania, procent tylko przy wyświetleniach, zakreślacz,
 * słupki, przypisy, inicjały i nazwa pliku. Wspólny dla HTML i PDF, więc tu jest większość reguł.
 */
import { describe, expect, it } from 'vitest';
import { EXAMPLE_REPORT } from '@/lib/report/example';
import {
  authorInitials,
  barWidth,
  commentSegments,
  previousLine,
  reportView,
  REPORT_ICONS,
} from '@/lib/report/format';
import type { ReportData } from '@/lib/report/types';

function report(overrides: Partial<ReportData> = {}): ReportData {
  return { ...structuredClone(EXAMPLE_REPORT), ...overrides };
}

const MINUS = '−';

describe('reportView — przykładowy raport (EkranRaport.html)', () => {
  const view = reportView(EXAMPLE_REPORT);

  it('nagłówek: miesiąc, klient, zakres dat', () => {
    expect(view.monthLabel).toBe('Wrzesień 2026');
    expect(view.intro).toBe('Co dał Instagram we wrześniu');
    expect(view.forClient).toBe('dla: Studio Lumi');
    expect(view.forClientLong).toBe('Raport miesięczny dla: Studio Lumi');
    expect(view.dateRangeShort).toBe('1–30.09.2026');
    expect(view.headline).toBe('23 osoby chciały się umówić');
    expect(view.author).toEqual({ name: 'Kadr Social', initials: 'KS' });
  });

  it('kluczowa liczba i dwie pozostałe z porównaniem „sierpień: N”', () => {
    expect(view.key).toEqual({
      key: 'book',
      icon: 'booking',
      label: 'Kliknięcia „Zarezerwuj”',
      value: '23',
      delta: 'sierpień: 17',
      change: null,
    });
    expect(view.metrics).toEqual([
      { key: 'call', icon: 'phone', label: 'Zadzwoń', value: '9', delta: 'sierpień: 11', change: null },
      {
        key: 'directions',
        icon: 'route',
        label: 'Wyznacz trasę',
        value: '14',
        delta: 'sierpień: 10',
        change: null,
      },
    ]);
  });

  it('zasięg: słupki M i M−1 względem większej liczby z pary', () => {
    expect(view.reach).toEqual([
      { label: 'Wyświetlenia', value: '12 480', widthPercent: 100, previous: false, change: '+9% m/m' },
      { label: 'sierpień', value: '11 420', widthPercent: 92, previous: true, change: null },
      { label: 'Nowi obserwujący', value: '64', widthPercent: 100, previous: false, change: null },
      { label: 'sierpień', value: '51', widthPercent: 80, previous: true, change: null },
    ]);
  });

  it('sekcje, komentarz z zakreślaczem, plan, przypis, stopka', () => {
    expect(view.sections).toEqual({ worked: 'Co zadziałało', reach: 'Zasięg', plan: 'Plan na październik' });
    expect(view.worked).toEqual([
      { text: 'Najwięcej rezerwacji przyszło po ', marked: false },
      { text: 'rolkach z metamorfozami brwi', marked: true },
      {
        text: '. Trzy z nich weszły do pięciu najlepiej oglądanych treści miesiąca.',
        marked: false,
      },
    ]);
    expect(view.plan).toBe(EXAMPLE_REPORT.planNext);
    expect(view.footnotes).toEqual([
      'Dane: eksport Meta Business Suite i panel profesjonalny Instagrama, 1–30 września 2026.',
    ]);
    expect(view.showSednoFooter).toBe(true);
    expect(view.footer).toBe('Przygotowano w');
  });

  it('szacowana szerokość kluczowej liczby (do zmniejszenia stopnia długich liczb)', () => {
    expect(view.keyValueEm).toBeCloseTo(2 * 0.61 - 2 * 0.02, 3);
    expect(reportView(report({ keyMetric: 'views' })).keyValueEm).toBeCloseTo(5 * 0.61 + 0.24 - 6 * 0.02, 3);
  });

  it('tytuł dokumentu i nazwa pliku PDF', () => {
    expect(view.documentTitle).toBe('Raport za wrzesień 2026 — Studio Lumi');
    expect(view.fileName).toBe('raport-studio-lumi-2026-09.pdf');
  });
});

describe('porównanie z poprzednim miesiącem', () => {
  it('liczba z M−1 słowami; 0 to też liczba', () => {
    expect(previousLine('2026-09', 17)).toBe('sierpień: 17');
    expect(previousLine('2026-09', 0)).toBe('sierpień: 0');
    expect(previousLine('2026-09', 12480)).toBe('sierpień: 12 480');
  });

  it('„Brak danych z …”, gdy nie ma liczby (brak previous, brak pola albo null)', () => {
    expect(previousLine('2026-09', undefined)).toBe('Brak danych z sierpnia');
    expect(previousLine('2026-09', null)).toBe('Brak danych z sierpnia');
  });

  it('styczeń porównuje się z grudniem poprzedniego roku', () => {
    expect(previousLine('2026-01', 5)).toBe('grudzień: 5');
    expect(previousLine('2026-01', undefined)).toBe('Brak danych z grudnia');
  });

  it('brak całego previous → wszędzie „Brak danych”, słupki bez M−1', () => {
    const view = reportView(report({ previous: undefined }));
    expect(view.key.delta).toBe('Brak danych z sierpnia');
    expect(view.metrics.map((m) => m.delta)).toEqual(['Brak danych z sierpnia', 'Brak danych z sierpnia']);
    expect(view.reach.filter((r) => r.previous)).toEqual([]);
    expect(view.reach.map((r) => r.widthPercent)).toEqual([100, 100]);
    expect(view.reach[0]?.change).toBeNull();
  });

  it('brak jednej liczby z M−1 → „Brak danych” tylko przy niej', () => {
    const view = reportView(report({ previous: { source: 'manual', actions: { book: 17, call: null } } }));
    expect(view.key.delta).toBe('sierpień: 17');
    expect(view.metrics.map((m) => m.delta)).toEqual(['Brak danych z sierpnia', 'Brak danych z sierpnia']);
    expect(view.reach.map((r) => r.label)).toEqual(['Wyświetlenia', 'Nowi obserwujący']);
  });

  it('spadek wygląda tak samo spokojnie jak wzrost: bez strzałek i znaków ostrzegawczych', () => {
    const view = reportView(
      report({ actions: { book: 3, call: 1, directions: 0 }, headline: '3 osoby chciały się umówić' }),
    );
    const all = [view.key, ...view.metrics].map((m) => `${m.value} ${m.delta}`).join(' ');
    expect(all).not.toMatch(/[↑↓▲▼⬆⬇!]/);
    expect(view.key.delta).toBe('sierpień: 17');
  });
});

describe('procent m/m tylko przy wyświetleniach', () => {
  const views = (
    current: number | null,
    previous: number | null | undefined,
    keyMetric: ReportData['keyMetric'],
  ) =>
    reportView(
      report({
        keyMetric,
        summary: { ...EXAMPLE_REPORT.summary, views: current },
        previous: { source: 'file', summary: previous === undefined ? {} : { views: previous } },
      }),
    );

  it('wzrost i spadek (prawdziwy minus U+2212); przy efektach nigdy', () => {
    expect(views(12480, 11420, 'book').reach[0]?.change).toBe('+9% m/m');
    expect(views(10000, 11000, 'book').reach[0]?.change).toBe(`${MINUS}9% m/m`);
    const view = views(10000, 11000, 'book');
    expect([view.key, ...view.metrics].every((m) => m.change === null)).toBe(true);
  });

  it('kluczowe wyświetlenia: procent przy kluczowej liczbie, nie drugi raz w zasięgu', () => {
    const view = views(10000, 11000, 'views');
    expect(view.key).toMatchObject({
      key: 'views',
      icon: 'eye',
      label: 'Wyświetlenia',
      value: '10 000',
      delta: 'sierpień: 11 000',
      change: `${MINUS}9% m/m`,
    });
    expect(view.reach.every((r) => r.change === null)).toBe(true);
  });

  it('bez procentu, gdy M−1 < 1000, |zmiana| < 1% albo brak liczby', () => {
    expect(views(1500, 999, 'book').reach[0]?.change).toBeNull();
    expect(views(10050, 10000, 'book').reach[0]?.change).toBeNull();
    expect(views(10000, undefined, 'book').reach[0]?.change).toBeNull();
    expect(views(null, 11000, 'book').reach[0]?.change).toBeNull();
  });
});

describe('kluczowe wyświetlenia', () => {
  it('pokazują wszystkie trzy liczby efektów z krótkimi etykietami', () => {
    const view = reportView(
      report({ keyMetric: 'views', actions: { book: 0, call: null, directions: 0 }, headline: 'x' }),
    );
    expect(view.metrics.map((m) => [m.key, m.icon, m.label, m.value])).toEqual([
      ['book', 'booking', 'Zarezerwuj', '0'],
      ['call', 'phone', 'Zadzwoń', '—'],
      ['directions', 'route', 'Wyznacz trasę', '0'],
    ]);
  });
});

describe('brak danych to „—”, nigdy 0', () => {
  it('liczby null', () => {
    const view = reportView(
      report({
        keyMetric: 'call',
        actions: { book: null, call: null, directions: 4 },
        summary: { ...EXAMPLE_REPORT.summary, views: null, follows: null },
        previous: undefined,
      }),
    );
    expect(view.key.value).toBe('—');
    expect(view.metrics.map((m) => m.value)).toEqual(['—', '4']);
    expect(view.reach).toEqual([
      { label: 'Wyświetlenia', value: '—', widthPercent: 0, previous: false, change: null },
    ]);
  });
});

describe('komentarz i zakreślacz', () => {
  it('zakreśla tylko pierwsze wystąpienie', () => {
    expect(commentSegments('raz, dwa, raz', 'raz')).toEqual([
      { text: 'raz', marked: true },
      { text: ', dwa, raz', marked: false },
    ]);
  });

  it('bez zaznaczenia nie ma zakreślacza', () => {
    expect(commentSegments('Tekst komentarza.')).toEqual([{ text: 'Tekst komentarza.', marked: false }]);
    expect(commentSegments('Tekst komentarza.', '   ')).toEqual([
      { text: 'Tekst komentarza.', marked: false },
    ]);
  });

  it('fragmentu nie ma w tekście → brak zakreślacza', () => {
    expect(commentSegments('Tekst komentarza.', 'czegoś innego')).toEqual([
      { text: 'Tekst komentarza.', marked: false },
    ]);
  });

  it('cały tekst zakreślony → jeden kawałek', () => {
    expect(commentSegments('Całość.', 'Całość.')).toEqual([{ text: 'Całość.', marked: true }]);
  });

  it('w raporcie najwyżej jeden kawałek jest zakreślony', () => {
    const view = reportView(report({ commentWorked: 'abc abc abc', commentMark: 'abc' }));
    expect(view.worked?.filter((s) => s.marked)).toHaveLength(1);
  });

  it('pusty komentarz lub plan → brak sekcji', () => {
    const view = reportView(report({ commentWorked: '  ', planNext: undefined, commentMark: 'x' }));
    expect(view.worked).toBeNull();
    expect(view.plan).toBeNull();
  });
});

describe('słupki', () => {
  it('szerokość względem większej liczby, niezerowa co najmniej 1%', () => {
    expect(barWidth(12480, 12480)).toBe(100);
    expect(barWidth(11420, 12480)).toBe(92);
    expect(barWidth(1, 100000)).toBe(1);
    expect(barWidth(0, 100)).toBe(0);
    expect(barWidth(null, 100)).toBe(0);
    expect(barWidth(5, 0)).toBe(0);
  });

  it('poprzedni miesiąc większy → jego słupek ma 100%', () => {
    const view = reportView(
      report({
        summary: { ...EXAMPLE_REPORT.summary, views: 500 },
        previous: { source: 'file', summary: { views: 1000 } },
      }),
    );
    expect(view.reach.slice(0, 2).map((r) => r.widthPercent)).toEqual([50, 100]);
  });

  it('bez kolumny obserwujących (null) nie ma ich słupków', () => {
    const view = reportView(report({ summary: { ...EXAMPLE_REPORT.summary, follows: null } }));
    expect(view.reach.map((r) => r.label)).toEqual(['Wyświetlenia', 'sierpień']);
  });
});

describe('przypisy', () => {
  it('zmiana metryk, niepełny miesiąc i miesiąc w toku — w tej kolejności', () => {
    const view = reportView(
      report({
        period: '2026-10',
        dataRange: { from: '2026-10-01T00:00:00+02:00', to: '2026-10-12T10:00:00+02:00' },
        flags: { metricChangeNote: true, incompleteDays: 27, inProgress: true },
      }),
    );
    expect(view.footnotes).toEqual([
      'Dane: eksport Meta Business Suite i panel profesjonalny Instagrama, 1–12 października 2026.',
      'Od kwietnia 2025 r. Meta liczy wyświetlenia inaczej niż wcześniej, więc starsze miesiące nie są wprost porównywalne.',
      'Dane z października obejmują 27 z 31 dni.',
      'Dane do 12 października.',
    ]);
  });

  it('niepełny luty w roku przestępnym liczy 29 dni', () => {
    const view = reportView(
      report({
        period: '2028-02',
        dataRange: { from: '2028-02-01T00:00:00+01:00', to: '2028-02-20T23:59:59+01:00' },
        flags: { incompleteDays: 20 },
      }),
    );
    expect(view.footnotes[1]).toBe('Dane z lutego obejmują 20 z 29 dni.');
    expect(view.sections.plan).toBe('Plan na marzec');
  });
});

describe('autor, marka i plik', () => {
  it('inicjały: pierwsze litery najwyżej dwóch słów, wielkie, także polskie', () => {
    expect(authorInitials('Kadr Social')).toBe('KS');
    expect(authorInitials('łukasz żak')).toBe('ŁŻ');
    expect(authorInitials('Agencja Social Media Pro')).toBe('AS');
    expect(authorInitials('Studio')).toBe('S');
    expect(authorInitials('„Kadr” Social')).toBe('KS');
    expect(authorInitials('kadr-social')).toBe('KS');
    expect(authorInitials('   ')).toBe('');
  });

  it('inicjały z nazwy w postaci rozłożonej (NFD) mają polskie litery', () => {
    expect(authorInitials('Z\u0307ak Studio')).toBe('ŻS');
    expect(authorInitials('Zażółć Gęślą'.normalize('NFD'))).toBe('ZG');
    expect(authorInitials('Śnieżka Łódź'.normalize('NFD'))).toBe('ŚŁ');
  });

  it('pusta nazwa autora → bez inicjałów', () => {
    expect(reportView(report({ author: { name: ' ' } })).author).toEqual({ name: '', initials: '' });
  });

  it('logo autora przechodzi do widoku', () => {
    const view = reportView(
      report({ author: { name: 'Kadr Social', logoUrl: 'https://example.com/logo.png' } }),
    );
    expect(view.author.logoUrl).toBe('https://example.com/logo.png');
  });

  it('branding autora → bez stopki Sedno', () => {
    expect(reportView(report({ branding: 'author' })).showSednoFooter).toBe(false);
  });

  it('nazwa pliku z polską nazwą klienta', () => {
    const view = reportView(report({ client: { name: 'Zażółć Gęślą Jaźń — Łódź' } }));
    expect(view.fileName).toBe('raport-zazolc-gesla-jazn-lodz-2026-09.pdf');
    expect(view.documentTitle).toBe('Raport za wrzesień 2026 — Zażółć Gęślą Jaźń — Łódź');
    expect(view.forClient).toBe('dla: Zażółć Gęślą Jaźń — Łódź');
  });

  it('ikony liczb raportu', () => {
    expect(REPORT_ICONS).toEqual({
      book: 'booking',
      call: 'phone',
      directions: 'route',
      views: 'eye',
      follows: 'client',
    });
  });
});

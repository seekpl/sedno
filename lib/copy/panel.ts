/**
 * Teksty panelu klientów /app/klienci (PROMPT.md §10 „Panel”, §14; EkranPanel.html). Do SMM-owca na „Ty”,
 * zdaniowa wielkość liter, bez emoji i wykrzykników. Liczby przez formatNumber, odmiana przez plural().
 */
import { formatNumber, monthForms, parseMonthKey, plural, type MonthKey } from '@/lib/i18n/pl';
import type { Enums } from '@/lib/supabase/database.types';

/** „we wrześniu 2026” */
const inMonth = (month: MonthKey) => `${monthForms(month).loc} ${parseMonthKey(month).year}`;

export const panel = {
  meta: {
    /** Tytuł karty: „Klienci we wrześniu 2026 — Sedno”. */
    title: (month: MonthKey) => `Klienci ${inMonth(month)}`,
  },
  /** h1: „Klienci we wrześniu”. */
  heading: (month: MonthKey) => `Klienci ${monthForms(month).loc}`,
  /** „2 z 5 raportów wysłane.”, „1 z 1 raportu wysłane.” (po „z” dopełniacz). */
  sentLine: (sent: number, total: number) =>
    `${formatNumber(sent)} z ${formatNumber(total)} ${plural(total, ['raportu', 'raportów', 'raportów'])} wysłane.`,
  /**
   * „Do końca miesiąca został 1 dzień roboczy.”, „… zostały 3 dni robocze.”, „… zostało 5 dni roboczych.”;
   * w ostatni weekend miesiąca: „Do końca miesiąca nie ma już dni roboczych.”
   */
  workingDaysLeft: (n: number) =>
    n === 0
      ? 'Do końca miesiąca nie ma już dni roboczych.'
      : `Do końca miesiąca ${plural(n, ['został', 'zostały', 'zostało'])} ${formatNumber(n)} ${plural(n, [
          'dzień roboczy',
          'dni robocze',
          'dni roboczych',
        ])}.`,
  actions: {
    addClient: 'Dodaj klienta',
    upload: 'Wgraj eksport',
  },
  stats: {
    label: 'Podsumowanie miesiąca',
    sent: {
      label: 'Raporty wysłane',
      value: (sent: number, total: number) => `${formatNumber(sent)} z ${formatNumber(total)}`,
      progress: (sent: number, total: number) =>
        `Raporty wysłane: ${formatNumber(sent)} z ${formatNumber(total)}`,
    },
    book: {
      label: '„Zarezerwuj” u wszystkich klientów',
      /** „sierpień: 69”, bez danych „sierpień: —”. */
      previous: (previousMonth: MonthKey, value: number | null) =>
        `${monthForms(previousMonth).nom}: ${formatNumber(value)}`,
    },
    clients: {
      label: 'Aktywni klienci',
    },
  },
  table: {
    caption: (month: MonthKey) => `Klienci i raporty ${inMonth(month)}`,
    client: 'Klient',
    book: '„Zarezerwuj”',
    call: '„Zadzwoń”',
    views: 'Wyświetlenia',
    status: 'Status',
    actions: 'Działania',
  },
  /**
   * Działanie w wierszu: widoczne słowo i dopowiedzenie dla czytników, żeby nazwa linku mówiła, którego
   * klienta dotyczy („Otwórz raport: Studio Lumi”).
   */
  rowActions: {
    sent: { label: 'Otwórz', rest: (client: string) => `raport: ${client}` },
    ready: { label: 'Wyślij', rest: (client: string) => `raport: ${client}` },
    draft: { label: 'Dokończ', rest: (client: string) => `raport: ${client}` },
    'no-export': { label: 'Wgraj', rest: (client: string) => `eksport: ${client}` },
  },
  footnote: '„—” oznacza brak danych, nie zero.',
  empty: {
    title: 'Dodaj pierwszego klienta',
    // PROMPT.md §14 empty.clients bez „i logo”: logo jest jedno na konto (Ustawienia), nie przy kliencie.
    body: 'Klient to jeden profil na Instagramie. Raporty i historia miesięcy zapisują się przy nim.',
    example: 'Zobacz przykładowy raport',
  },
  loadError: {
    title: 'Nie udało się wczytać klientów.',
    body: 'Dane klientów nie dotarły z serwera. Odśwież stronę za chwilę.',
    retry: 'Odśwież stronę',
  },
  add: {
    title: 'Dodaj klienta',
    body: 'Klient to jeden profil na Instagramie.',
    name: {
      label: 'Nazwa klienta',
      hint: 'Pojawi się w raporcie po słowie „dla:”.',
    },
    industry: {
      label: 'Branża',
    },
    submit: 'Dodaj klienta',
    cancel: 'Anuluj',
    errorTitle: 'Klient nie został dodany.',
    errors: {
      nameRequired: 'Brak nazwy klienta. Wpisz nazwę, która ma się pokazać w raporcie.',
      nameTooLong: 'Nazwa ma więcej niż 80 znaków. Skróć ją do 80.',
      industryInvalid: 'Tej branży nie ma na liście. Wybierz jedną z listy.',
      session: 'Sesja wygasła. Zaloguj się ponownie, a potem dodaj klienta.',
      rateLimited: 'Dodajesz klientów zbyt szybko. Odczekaj kilka minut i spróbuj ponownie.',
      /** Górna granica klientów na konto (baza), nie limit planu. */
      accountLimit: (max: number) =>
        `Konto ma już ${formatNumber(max)} ${plural(max, ['klienta', 'klientów', 'klientów'])}, czyli najwięcej, ile mieści jedno konto.`,
      failed: 'Nie udało się zapisać klienta. Sprawdź połączenie i spróbuj ponownie.',
    },
  },
  /** Toast po dodaniu (przycisk „Dodaj klienta” → „Klient dodany”). */
  toast: {
    created: 'Klient dodany',
  },
  /** Branże w kolejności listy (wartości jak enum industry_t w bazie). */
  industries: {
    salon: 'Salon',
    restauracja: 'Restauracja',
    gabinet: 'Gabinet',
    sklep: 'Sklep',
    inne: 'Inna',
  } satisfies Record<Enums<'industry_t'>, string>,
} as const;

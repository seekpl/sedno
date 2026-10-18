/**
 * Teksty historii raportów /app/raporty (PROMPT.md §10 „Historia raportów (paginacja po 20)”, §14:
 * empty.history). Do SMM-owca na „Ty”, zdaniowa wielkość liter, bez emoji i wykrzykników. Liczby przez
 * formatNumber, odmiana przez plural(), status zawsze słowem i ikoną.
 */
import { formatNumber, plural } from '@/lib/i18n/pl';

export const history = {
  meta: {
    title: 'Raporty',
    /** „Raporty, strona 2” (tytuł karty od drugiej strony). */
    titlePage: (page: number) => `Raporty, strona ${formatNumber(page)}`,
  },
  heading: 'Raporty',
  /** „12 raportów, od najnowszego miesiąca.” */
  lead: (total: number) =>
    `${formatNumber(total)} ${plural(total, ['raport', 'raporty', 'raportów'])}, od najnowszego miesiąca.`,
  table: {
    caption: 'Raporty, od najnowszego miesiąca',
    client: 'Klient',
    month: 'Miesiąc',
    status: 'Status',
    sent: 'Wysłany',
    link: 'Link',
    actions: 'Działania',
  },
  /** Brak daty wysłania i brak linku: „—” widoczne, słowo dla czytników. */
  notSent: 'nie wysłano',
  noLink: 'brak linku',
  /** Stan linku do raportu (słowo i ikona). */
  link: {
    active: 'Aktywny',
    revoked: 'Wyłączony',
    expired: 'Wygasł',
  },
  /** Działanie w wierszu: „Otwórz” i dopowiedzenie dla czytników („raport: Studio Lumi, wrzesień 2026”). */
  open: {
    label: 'Otwórz',
    rest: (client: string, month: string) => `raport: ${client}, ${month}`,
  },
  pagination: 'Strony historii',
  empty: {
    title: 'Zrób pierwszy raport',
    // PROMPT.md §14 empty.history.
    body: 'Raporty z tego miesiąca pojawią się tutaj. Zacznij od wgrania eksportu.',
    action: 'Przejdź do klientów',
  },
  loadError: {
    title: 'Nie udało się wczytać raportów.',
    body: 'Lista raportów nie dotarła z serwera. Odśwież stronę za chwilę.',
    retry: 'Odśwież stronę',
  },
} as const;

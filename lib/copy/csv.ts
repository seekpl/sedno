/**
 * Błędy i ostrzeżenia wczytywania pliku (PROMPT.md §6, §14). Błąd mówi przyczynę i naprawę, nie przeprasza.
 * Tytuł to pierwsze zdanie tekstu z §14, treść — reszta.
 */
import type { RequiredField } from '@/lib/csv/types';
import { plural } from '@/lib/i18n/pl';

/** Nazwy kolumn w komunikatach (jak w polskim interfejsie Meta Business Suite — do potwierdzenia, §19). */
export const columnNames: Record<RequiredField, string> = {
  publishedAt: 'Czas publikacji',
  views: 'Wyświetlenia',
};

export const csv = {
  errors: {
    E_NOT_CSV: {
      title: 'To nie jest plik CSV',
      body: 'Wgraj plik z rozszerzeniem .csv pobrany z Meta Business Suite.',
    },
    E_EMPTY: {
      title: 'Plik jest pusty',
      body: 'Pobierz eksport ponownie i wgraj go bez otwierania w Excelu.',
    },
    E_TOO_BIG: {
      size: {
        title: 'Plik ma więcej niż 10 MB',
        body: 'Wybierz krótszy okres, na przykład dwa miesiące.',
      },
      rows: {
        title: 'Plik ma więcej niż 20 000 wierszy',
        body: 'Wybierz krótszy okres, na przykład dwa miesiące.',
      },
    },
    E_MISSING_COLUMNS: {
      title: 'To nie jest eksport treści',
      body: (column: string) =>
        `W pliku brakuje kolumny „${column}”. Pobierz eksport z zakładki Treści albo przypisz kolumny ręcznie.`,
    },
    E_NO_ROWS_IN_MONTH: {
      title: (monthGen: string) => `W pliku nie ma publikacji z ${monthGen}`,
      body: (range: string) => `Plik obejmuje ${range}.`,
    },
  },
  warnings: {
    W_ENCODING_GUESSED: {
      title: 'Plik był zapisany w innym kodowaniu',
      body: 'Sprawdź, czy polskie znaki w podglądzie wyglądają poprawnie.',
    },
    W_INCOMPLETE_MONTH: {
      /** „Eksport kończy się 27 września” */
      title: (date: string) => `Eksport kończy się ${date}`,
      /** „Porównanie z sierpniem obejmie 27 dni, nie 30. Wgraj pełny plik albo zostaw przypis w raporcie.” („1 dzień”) */
      body: (previousIns: string, days: number, monthDays: number) =>
        `Porównanie z ${previousIns} obejmie ${days} ${plural(days, ['dzień', 'dni', 'dni'])}, nie ${monthDays}. Wgraj pełny plik albo zostaw przypis w raporcie.`,
    },
    W_MONTH_IN_PROGRESS: {
      /** „Październik jeszcze trwa” */
      title: (monthNomCapitalized: string) => `${monthNomCapitalized} jeszcze trwa`,
      body: (date: string) => `Raport pokaże dane do ${date}.`,
    },
    W_METRIC_CHANGE: {
      title: 'W kwietniu 2025 r. Meta zastąpiła metrykę Impressions metryką Views',
      body: 'Starsze miesiące nie są wprost porównywalne, więc raport dodaje przypis dla klienta.',
    },
  },
} as const;

/**
 * Teksty raportu dla klienta (PROMPT.md §7, §11, §14). Raport pisze bezosobowo: bez „Ty” i bez „Pan/Pani”.
 * Nazwy przycisków Instagrama w polskim cudzysłowie; wewnątrz cudzysłowu » «.
 */
import type { ActionKey } from '@/lib/report/types';

/** Nazwy przycisków w mianowniku (do potwierdzenia na zrzucie panelu, §19 p. 2). */
export const buttonNames: Record<ActionKey, string> = {
  book: 'Zarezerwuj',
  call: 'Zadzwoń',
  directions: 'Wyznacz trasę',
};

export const report = {
  /** „Kliknięcia „Zarezerwuj”” — etykieta liczby w raporcie i pola w edytorze. */
  actionLabel: (key: ActionKey) => `Kliknięcia „${buttonNames[key]}”`,
  /** Krótka etykieta przy liczbie drugorzędnej: „Zadzwoń”. */
  actionShort: (key: ActionKey) => buttonNames[key],
  views: 'Wyświetlenia',
  follows: 'Nowi obserwujący',
  /** „Co dał Instagram we wrześniu” */
  intro: (monthLoc: string) => `Co dał Instagram ${monthLoc}`,
  /** „dla: Studio Lumi” (telefon) */
  forClient: (client: string) => `dla: ${client}`,
  /** „Raport miesięczny dla: Studio Lumi” (PDF) */
  forClientLong: (client: string) => `Raport miesięczny dla: ${client}`,
  /** „sierpień: 17” — liczba z poprzedniego miesiąca słowami (PROMPT.md §7). */
  previousValue: (monthNom: string, value: string) => `${monthNom}: ${value}`,
  /** report.noPrevious — „Brak danych z sierpnia” */
  noPrevious: (monthGen: string) => `Brak danych z ${monthGen}`,
  sections: {
    worked: 'Co zadziałało',
    reach: 'Zasięg',
    /** „Plan na październik” */
    plan: (monthNom: string) => `Plan na ${monthNom}`,
  },
  /** report.sourceNote */
  sourceNote: (range: string) =>
    `Dane: eksport Meta Business Suite i panel profesjonalny Instagrama, ${range}.`,
  /** report.metricNote */
  metricNote:
    'Od kwietnia 2025 r. Meta liczy wyświetlenia inaczej niż wcześniej, więc starsze miesiące nie są wprost porównywalne.',
  /** Przypis przy niepełnym miesiącu: „Dane z września obejmują 27 z 30 dni.” */
  incompleteNote: (monthGen: string, days: number, monthDays: number) =>
    `Dane z ${monthGen} obejmują ${days} z ${monthDays} dni.`,
  /** Przypis, gdy miesiąc jeszcze trwa: „Dane do 12 października.” */
  inProgressNote: (date: string) => `Dane do ${date}.`,
  /** report.footer — „Przygotowano w [logo Sedno]” */
  footer: 'Przygotowano w',
  /** Tytuł strony z raportem i metadane PDF: „Raport za wrzesień 2026 — Studio Lumi” */
  documentTitle: (monthNom: string, year: number, client: string) =>
    `Raport za ${monthNom} ${year} — ${client}`,
  /** Tytuły z szablonu (PROMPT.md §7). Formy: [1, 2–4, 5+]. */
  headline: {
    book: {
      people: ['osoba', 'osoby', 'osób'] as const,
      verb: ['chciała', 'chciały', 'chciało'] as const,
      /** „23 osoby chciały się umówić” */
      template: (n: string, people: string, verb: string) => `${n} ${people} ${verb} się umówić`,
    },
    call: {
      forms: ['osoba zadzwoniła', 'osoby zadzwoniły', 'osób zadzwoniło'] as const,
      template: (n: string, form: string) => `${n} ${form}`,
    },
    directions: {
      forms: ['osoba sprawdziła', 'osoby sprawdziły', 'osób sprawdziło'] as const,
      template: (n: string, form: string) => `${n} ${form} dojazd`,
    },
    /** „W tym miesiącu nikt nie kliknął »Zarezerwuj«” */
    zero: (button: string) => `W tym miesiącu nikt nie kliknął »${button}«`,
    /** Gdy kluczową liczbą są wyświetlenia: „12 480 wyświetleń we wrześniu” */
    views: {
      forms: ['wyświetlenie', 'wyświetlenia', 'wyświetleń'] as const,
      template: (n: string, form: string, monthLoc: string) => `${n} ${form} ${monthLoc}`,
    },
    /** Brak danych o wyświetleniach i efektach: „Raport za wrzesień” */
    fallback: (monthNom: string) => `Raport za ${monthNom}`,
  },
  /** Podpowiedź „Co zrobiliśmy” z liczby publikacji wg typu: „8 rolek, 6 postów, 14 relacji”. */
  postTypes: {
    reel: ['rolka', 'rolki', 'rolek'] as const,
    post: ['post', 'posty', 'postów'] as const,
    carousel: ['karuzela', 'karuzele', 'karuzel'] as const,
    story: ['relacja', 'relacje', 'relacji'] as const,
    other: ['publikacja', 'publikacje', 'publikacji'] as const,
  },
  /** Oznaczenie danych przykładowych (zasada 6). */
  exampleBadge: 'Dane przykładowe',
} as const;

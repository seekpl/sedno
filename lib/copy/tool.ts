/**
 * Teksty narzędzia bez konta /nowy (PROMPT.md §10, §14): 1. Wgraj → 2. Efekty → 3. Podgląd i PDF. Całość: lib/copy/pl.ts.
 * Do SMM-owca na „Ty”, zdaniowa wielkość liter, bez emoji i wykrzykników. Błąd mówi przyczynę i naprawę.
 * Przycisk i wynik nazywają się tak samo („Pobierz PDF” → „PDF pobrany”).
 * Błędy i ostrzeżenia pliku są w lib/copy/csv.ts, etykiety liczb i odmiana w raporcie — w lib/copy/report.ts.
 */

export const tool = {
  meta: {
    title: 'Nowy raport',
    description:
      'Zrób miesięczny raport dla klienta z eksportu Meta Business Suite i trzech liczb z panelu profesjonalnego. Bez zakładania konta: plik zostaje w Twojej przeglądarce.',
  },
  /** „Krok 1 z 3” */
  stepCaption: (step: number) => `Krok ${step} z 3`,
  /** Lista kroków nad formularzem (EkranUzupelnij.html). */
  steps: {
    label: 'Kroki raportu',
    items: ['1. Eksport wczytany', '2. Efekty i komentarz', '3. Podgląd i PDF'] as const,
  },
  /** Linia prywatności przy wgrywaniu (EkranWgrywanie.html). Sprawdza ją test e2e prywatności. */
  privacy: 'Plik zostaje w Twojej przeglądarce. Nie wysyłamy go na serwer.',
  upload: {
    /** „Wgraj eksport za wrzesień” */
    heading: (monthNom: string) => `Wgraj eksport za ${monthNom}`,
    title: 'Wgraj eksport z Meta Business Suite',
    /** Na telefonie (EkranWgrywanie.html): bez przeciągania, tytuł mówi, co zrobić. */
    phoneTitle: 'Wybierz plik CSV',
    hint: 'Plik CSV z sekcji Statystyki → Treści. Przeciągnij go tutaj albo wybierz z dysku.',
    /** Na telefonie nie ma przeciągania: tylko przycisk i podpowiedź, gdzie szukać pliku. */
    phoneHint:
      'Meta Business Suite → Statystyki → Treści → Eksportuj dane. Na telefonie plik znajdziesz w Pobranych.',
    overTitle: 'Upuść plik, żeby go wczytać',
    overHint: 'Jeden plik CSV naraz.',
    button: 'Wybierz plik',
    retry: 'Wybierz inny plik',
    mapColumns: 'Przypisz kolumny ręcznie',
    howTo: 'Jak zrobić eksport?',
    howToHref: '/poradniki/jak-zrobic-raport-z-instagrama-dla-klienta#eksport',
    newTab: '(otwiera się w nowej karcie)',
    /** Zanim parser poda pierwszą liczbę wierszy. */
    reading: 'Czytam plik…',
    /** „Czytam plik: 12 z 31 publikacji” */
    progress: (done: string, total: string) => `Czytam plik: ${done} z ${total} publikacji`,
    progressLabel: 'Postęp wczytywania pliku',
    /** Nieoczekiwany błąd przeglądarki przy czytaniu pliku (nie błąd formatu). */
    failed: {
      title: 'Przeglądarka nie odczytała pliku',
      body: 'Odśwież stronę i wgraj plik ponownie. Jeśli to nie pomoże, pobierz eksport jeszcze raz.',
    },
  },
  mapping: {
    heading: 'Przypisz kolumny',
    lead: 'Nie rozpoznajemy wszystkich kolumn w tym pliku. Wskaż, w której kolumnie jest czas publikacji, a w której wyświetlenia. Ten wybór zapamiętamy w tej przeglądarce.',
    placeholder: '— wybierz kolumnę —',
    submit: 'Wczytaj z tymi kolumnami',
    errors: {
      /** „Wybierz kolumnę dla pola „Czas publikacji”.” */
      required: (column: string) => `Wybierz kolumnę dla pola „${column}”.`,
      same: 'Czas publikacji i wyświetlenia muszą być w dwóch różnych kolumnach. Wybierz inną kolumnę.',
      /** Parser nie znalazł w wybranej kolumnie wartości tego pola (np. dat). */
      noMatch: (header: string, column: string) =>
        `W kolumnie „${header}” nie ma wartości pola „${column}”. Wybierz inną kolumnę.`,
    },
  },
  noRows: {
    /** „Przełącz na Wrzesień 2026” */
    switchTo: (monthLabel: string) => `Przełącz na ${monthLabel}`,
  },
  effects: {
    heading: 'Dopisz efekty',
    /** Szeroki ekran: „Raport: Studio Lumi, wrzesień” (EkranUzupelnij.html). */
    headingWide: (client: string, monthNom: string) => `Raport: ${client}, ${monthNom}`,
    newClient: 'nowy klient',
    changeFile: 'Wgraj inny plik',
    /** upload.success — „Wczytano 31 publikacji z września”. Formy w bierniku: 1 publikację, 2 publikacje, 5 publikacji. */
    loaded: {
      posts: ['publikację', 'publikacje', 'publikacji'] as const,
      title: (n: string, posts: string, monthGen: string) => `Wczytano ${n} ${posts} z ${monthGen}`,
      body: (range: string) => `Okres ${range}. Teraz dopisz trzy liczby z panelu profesjonalnego.`,
    },
    onReport: {
      title: 'Na raporcie',
      author: {
        label: 'Twoja nazwa albo marka',
        hint: 'Pojawi się na górze raportu. Zapamiętamy ją w tej przeglądarce.',
      },
      client: {
        label: 'Nazwa klienta',
        placeholder: 'np. Studio Lumi',
        hint: 'Potrzebna do pobrania PDF.',
        required: 'Wpisz nazwę klienta. Bez niej nie pobierzesz PDF.',
        /** Neutralny zastępnik w podglądzie, dopóki pole jest puste (nie zmyślona marka). */
        previewPlaceholder: 'Nazwa klienta',
      },
    },
    actions: {
      title: 'Efekty z panelu profesjonalnego',
      /** actions.hint — „Panel profesjonalny → Statystyki → Kontakty, wrzesień.” (ścieżka do potwierdzenia, §19) */
      hint: (monthNom: string) => `Panel profesjonalny → Statystyki → Kontakty, ${monthNom}.`,
      invalid: 'Wpisz liczbę cyframi, np. 9.',
      howTo: 'Gdzie znaleźć te liczby?',
      howToHref: '/poradniki/jak-zrobic-raport-z-instagrama-dla-klienta#efekty',
    },
    previous: {
      /** „Dodaj liczby z sierpnia (nieobowiązkowe)” */
      summary: (monthGen: string) => `Dodaj liczby z ${monthGen} (nieobowiązkowe)`,
      lead: 'Raport pokaże je pod liczbami tego miesiąca jako porównanie.',
      /** „Kliknięcia „Zarezerwuj” w sierpniu” */
      actionLabel: (label: string, monthLoc: string) => `${label} ${monthLoc}`,
      /** „Wyświetlenia w sierpniu” */
      viewsLabel: (monthLoc: string) => `Wyświetlenia ${monthLoc}`,
      viewsHint: (monthNom: string) => `Suma wyświetleń z eksportu Meta Business Suite za ${monthNom}.`,
      partial: {
        /** „Plik zaczyna się 13 sierpnia 2026” */
        title: (date: string) => `Plik zaczyna się ${date}`,
        body: (monthNom: string, monthGen: string) =>
          `Dlatego ${monthNom} z pliku nie trafi do porównania. Wpisz liczby z ${monthGen} niżej albo wgraj eksport od 1 ${monthGen}.`,
      },
    },
    keyMetric: {
      legend: 'Kluczowa liczba raportu',
      /** editor.keyMetricHint */
      hint: 'Ta liczba zostanie zakreślona na górze raportu.',
      /** „„Zarezerwuj”” */
      action: (button: string) => `„${button}”`,
      views: 'Wyświetlenia',
      /** „„Zarezerwuj” (23)” */
      withValue: (name: string, value: string) => `${name} (${value})`,
      unavailableAction: 'Kliknięcia bez liczby nie mogą być kluczową liczbą. Najpierw wpisz liczbę powyżej.',
      unavailableViews: 'Plik nie ma wyświetleń z tego miesiąca, więc nie mogą być kluczową liczbą.',
      fallback: 'Bez kliknięć zakreślone są wyświetlenia. Wpisz liczby powyżej, żeby to zmienić.',
      /** Bez kliknięć i bez wyświetleń w pliku raport nie ma liczby do zakreślenia. */
      fallbackNoViews: 'Raport nie ma jeszcze kluczowej liczby. Wpisz liczbę kliknięć powyżej.',
    },
    headline: {
      label: 'Tytuł raportu',
      hint: 'Powstaje z kluczowej liczby. Możesz go zmienić.',
      restore: 'Przywróć tytuł z liczb',
    },
    comment: {
      title: 'Komentarz dla klienta',
      /** „np. 8 rolek, 9 postów, 14 relacji” */
      workedPlaceholder: (suggestion: string) => `np. ${suggestion}`,
      emoji: 'Emoji nie pojawią się w raporcie, bo kroje pisma raportu ich nie mają.',
      mark: {
        button: 'Zakreśl zaznaczony fragment',
        hint: 'Zaznacz w polu „Co zadziałało” zdanie albo fragment. Raport podkreśli go zakreślaczem, jeden na raport.',
        tooLong: (max: number) => `Zaznaczony fragment jest za długi. Zaznacz najwyżej ${max} znaków.`,
        /** „Zakreślone: „rolki z metamorfozami”” */
        current: (text: string) => `Zakreślone: „${text}”`,
        remove: 'Usuń zakreślenie',
      },
    },
    incomplete: {
      upload: 'Wgraj pełny plik',
      keep: 'Zostaw przypis',
      kept: 'Przypis o niepełnym miesiącu zostaje w raporcie.',
    },
    toPreview: 'Zobacz raport',
    toPdf: 'Przejdź do PDF',
  },
  preview: {
    heading: 'Raport dla klienta',
    liveLabel: 'Podgląd dla klienta',
    frameLabel: 'Raport tak, jak zobaczy go klient na telefonie',
    pdf: 'Pobierz PDF',
    pdfUnavailable: 'Wpisz nazwę klienta w kroku 2, żeby pobrać PDF.',
    back: 'Wróć do edycji',
    /** toast — przycisk „Pobierz PDF” → wynik „PDF pobrany”. */
    downloaded: 'PDF pobrany',
    success: {
      /** „Raport dla Studio Lumi jest gotowy” */
      title: (client: string) => `Raport dla ${client} jest gotowy`,
      body: 'PDF jest w Pobranych. Możesz wysłać go klientowi.',
    },
    error: {
      title: 'Nie udało się utworzyć PDF',
      body: 'Odśwież stronę i spróbuj ponownie.',
    },
    /** Uczciwa informacja o funkcjach kont (PROMPT.md §2.5), gdy konta są wyłączone. */
    soon: {
      badge: 'Wkrótce',
      text: 'Link do raportu i historia raportów będą w planie Solo.',
    },
    /** To samo, gdy konta działają (features.accounts): link i historia są w koncie, /nowy nic nie zapisuje. */
    account: {
      text: 'Link do raportu i historia raportów są w koncie. Ten raport się nie zapisze, więc najpierw pobierz PDF.',
      login: 'Zaloguj się',
      loginHref: '/logowanie',
    },
  },
} as const;

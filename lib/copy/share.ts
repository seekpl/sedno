/**
 * Teksty raportu publicznego /r/[token] (PROMPT.md §11, §14: share.expired). Czyta je klient SMM-owca, więc
 * piszemy bezosobowo, bez „Ty” i bez „Pan/Pani”. Przycisk i wynik nazywają się tak samo: „Pobierz PDF” →
 * „PDF pobrany”.
 */
export const share = {
  /** share.expired — link wygasły, odwołany albo nieprawidłowy (PROMPT.md §11). */
  expired: 'Ten raport nie jest już dostępny. Poproś osobę, która go wysłała, o nowy link.',
  /** Tytuł karty przeglądarki, gdy raportu nie ma (bez żadnych danych raportu). */
  unavailableTitle: 'Raport niedostępny',
  /** Za dużo otwarć z jednego połączenia w ciągu minuty (limit chroni bazę). Nagłówek i wyjaśnienie. */
  rateLimited: {
    heading: 'Raport otwierano zbyt często.',
    detail: 'Z tego połączenia było wiele otwarć w ciągu minuty. Odśwież stronę za minutę.',
  },
  /**
   * Strona dla robota podglądu linku (komunikatory): bez treści raportu i bez sprawdzania, czy link działa.
   * Tytuł i opis podglądu biorą się z meta (ogólne, bez liczb i bez nazwy klienta).
   */
  preview: {
    heading: 'Raport miesięczny.',
    detail: 'Raport jest dostępny po otwarciu linku w przeglądarce.',
  },
  /** Błąd serwera przy odczycie (np. baza nie odpowiada) — nie mylimy go z wygasłym linkiem. */
  failed: {
    heading: 'Raport się nie wczytał.',
    detail: 'Serwer nie odpowiedział. Odśwież stronę za chwilę.',
    retry: 'Wczytaj ponownie',
  },
  meta: {
    /** Open Graph ogólny, bez liczb i bez nazwy klienta (PROMPT.md §11). */
    ogTitle: 'Raport miesięczny',
    description: 'Miesięczny raport dla klienta: efekty i zasięgi.',
  },
  /** Etykieta regionu z raportem. */
  reportLabel: 'Raport',
  pdf: {
    button: 'Pobierz PDF',
    /** toast po pobraniu */
    downloaded: 'PDF pobrany',
    error: {
      title: 'Nie udało się utworzyć PDF',
      body: 'Odśwież stronę i spróbuj ponownie.',
    },
  },
} as const;

/**
 * Strony prawne — szkielety z faktami o przepływie danych i miejscami do uzupełnienia (PROMPT.md §15).
 * Nie są ostatecznymi tekstami prawnymi. Treść pisze prawnik.
 */
const TODO = '[DO UZUPEŁNIENIA przez prawnika]';

export const legalPages = {
  todoMarker: TODO,
  draftNotice: 'Ta strona jest szkicem. Ostateczny tekst przygotuje prawnik.',
  privacy: {
    title: 'Polityka prywatności',
    sections: [
      { title: 'Administrator danych', paragraphs: [TODO] },
      {
        title: 'Plik z eksportem',
        paragraphs: [
          'Plik CSV z Meta Business Suite czyta Twoja przeglądarka. Nie wysyłamy go na serwer i go nie zapisujemy. Raport i PDF powstają na Twoim urządzeniu.',
        ],
      },
      {
        title: 'Lista oczekujących',
        paragraphs: [
          'Gdy zapisujesz się na powiadomienie o starcie planu, zapisujemy adres e-mail, nazwę planu i datę zgody. Wyślemy jedną wiadomość o starcie planu.',
          `Podstawa prawna i okres przechowywania: ${TODO}`,
        ],
      },
      {
        title: 'Anonimowe dane o użyciu',
        paragraphs: [
          'Zapisujemy nazwy zdarzeń i liczby, na przykład że plik został wczytany i ile miał wierszy, oraz losowy identyfikator sesji przechowywany w przeglądarce do jej zamknięcia. Nie używamy plików cookie ani zewnętrznych narzędzi analitycznych. Zdarzenia nie zawierają treści pliku ani raportu.',
        ],
      },
      {
        title: 'Dane techniczne',
        paragraphs: [
          'Adres IP służy wyłącznie do ograniczania liczby zapytań i nie jest zapisywany przez aplikację.',
          `Dostawcy (hosting, baza danych w UE) i umowy powierzenia: ${TODO}`,
        ],
      },
      { title: 'Twoje prawa', paragraphs: [TODO] },
      { title: 'Kontakt w sprawie danych', paragraphs: [TODO] },
    ],
  },
  terms: {
    title: 'Regulamin',
    sections: [
      { title: 'Postanowienia ogólne', paragraphs: [TODO] },
      { title: 'Zakres usługi', paragraphs: [TODO] },
      { title: 'Płatności i faktury', paragraphs: [TODO] },
      { title: 'Reklamacje', paragraphs: [TODO] },
      { title: 'Zmiany regulaminu', paragraphs: [TODO] },
    ],
  },
  contact: {
    title: 'Kontakt',
    sections: [
      { title: 'Adres e-mail', paragraphs: ['[DO UZUPEŁNIENIA: adres kontaktowy]'] },
      { title: 'Dane firmy', paragraphs: ['[DO UZUPEŁNIENIA: nazwa, adres, NIP]'] },
    ],
  },
} as const;

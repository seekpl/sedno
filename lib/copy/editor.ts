/**
 * Teksty edytora raportu z kontem /app/klienci/{id}/{YYYY-MM} (PROMPT.md §10, §11, §14; EkranUzupelnij.html):
 * 1. Eksport → 2. Efekty i komentarz → 3. Wyślij. Do SMM-owca na „Ty”, zdaniowa wielkość liter, bez emoji
 * i wykrzykników. Przycisk i wynik nazywają się tak samo („Kopiuj link” → „Link skopiowany”). Błąd mówi
 * przyczynę i naprawę. Pola efektów, komentarza i ostrzeżenia są wspólne z /nowy (lib/copy/tool.ts).
 */
import { formatNumber, monthForms, parseMonthKey, plural, type MonthKey } from '@/lib/i18n/pl';

/** „wrzesień 2026” */
const monthYear = (month: MonthKey) => `${monthForms(month).nom} ${parseMonthKey(month).year}`;

export const editor = {
  meta: {
    /** Tytuł karty: „Raport: Studio Lumi, wrzesień 2026 — Sedno”. */
    title: (client: string, month: MonthKey) => `Raport: ${client}, ${monthYear(month)}`,
    /** Gdy klienta nie ma (strona 404). */
    fallback: 'Raport',
  },
  /** Ładowanie edytora (loading.tsx): tekst dla czytników ekranu obok szkieletu. */
  loading: 'Wczytuję raport…',
  /** Błąd odczytu z bazy przy otwieraniu edytora. */
  loadError: {
    title: 'Nie udało się wczytać raportu.',
    body: 'Dane raportu nie dotarły z serwera. Odśwież stronę za chwilę.',
    retry: 'Odśwież stronę',
  },
  /** Link nad nagłówkiem (EkranUzupelnij.html); dopowiedzenie tylko dla czytników ekranu. */
  back: {
    label: 'Klienci',
    /** „, lista za wrzesień 2026” */
    hint: (month: MonthKey) => `, lista za ${monthYear(month)}`,
  },
  /** h1 — „Raport: Studio Lumi, wrzesień” (EkranUzupelnij.html). */
  heading: (client: string, monthNom: string) => `Raport: ${client}, ${monthNom}`,
  /** Lista kroków. Krok 1 przed wczytaniem nazywa się „Wgraj eksport”, potem „Eksport wczytany”. */
  steps: (current: 1 | 2 | 3) =>
    [
      current === 1 ? '1. Wgraj eksport' : '1. Eksport wczytany',
      '2. Efekty i komentarz',
      '3. Wyślij',
    ] as const,
  /** Autor i klient na raporcie — z konta, nie do zmiany w edytorze. */
  identity: {
    /** „Autor na raporcie: Kadr Social.” */
    author: (name: string) => `Autor na raporcie: ${name}.`,
    /** „Autor na raporcie: Kadr Social, z Twoim logo.” */
    authorWithLogo: (name: string) => `Autor na raporcie: ${name}, z Twoim logo.`,
    logoOnly: 'Na raporcie jest Twoje logo.',
    none: 'Raport nie ma nazwy autora, więc zaczyna się od nazwy klienta.',
    settings: 'Zmień w Ustawieniach',
    settingsHref: '/app/ustawienia',
  },
  /** Krok 1 z kontem: plik nie jest zapisywany, tylko liczby z podsumowania. */
  upload: {
    title: 'Zapisujemy liczby, nie plik',
    body: 'Plik CSV czyta Twoja przeglądarka. Przy zapisie raportu trafiają na serwer tylko liczby z podsumowania eksportu, efekty i Twój komentarz.',
    bodySaved:
      'Ten raport ma zapisane liczby z podsumowania, ale nie plik CSV. Nowy plik policzy je od nowa, a efekty i komentarz zostaną.',
    back: 'Wróć do zapisanego raportu',
  },
  /** Krok 2 bez pliku: liczby z zapisanego raportu. */
  saved: {
    title: 'Liczby z zapisanego raportu',
    /** „Wyświetlenia, publikacje i najlepsze treści pochodzą z eksportu za 1–30 września 2026. …” */
    body: (range: string) =>
      `Wyświetlenia, publikacje i najlepsze treści pochodzą z eksportu za ${range}. Pliku CSV nie zapisujemy, więc żeby policzyć je od nowa, wgraj eksport ponownie.`,
    upload: 'Wgraj eksport ponownie',
  },
  /** Porównanie z zapisanym raportem za M−1. */
  history: {
    /** „Porównanie z sierpniem pochodzi z zapisanego raportu za sierpień.” */
    note: (previousIns: string, previousNom: string) =>
      `Porównanie z ${previousIns} pochodzi z zapisanego raportu za ${previousNom}.`,
    /** Gdy wyświetlenia M−1 są z pliku: „Kliknięcia z sierpnia pochodzą z zapisanego raportu za sierpień.” */
    actions: (previousGen: string, previousNom: string) =>
      `Kliknięcia z ${previousGen} pochodzą z zapisanego raportu za ${previousNom}.`,
    /** Gdy raport za M−1 nie ma kliknięć: „Wyświetlenia z sierpnia pochodzą z zapisanego raportu za sierpień.” */
    views: (previousGen: string, previousNom: string) =>
      `Wyświetlenia z ${previousGen} pochodzą z zapisanego raportu za ${previousNom}.`,
  },
  save: {
    draft: 'Zapisz szkic',
    /** Toast po „Zapisz szkic”. */
    saved: 'Szkic zapisany',
    /** Raport „Gotowy” albo „Wysłany” nie jest szkicem: zapis zostawia status, a link pokazuje zmiany. */
    changes: 'Zapisz zmiany',
    /** Toast po „Zapisz zmiany”. */
    changesSaved: 'Zmiany zapisane',
    toSend: 'Przejdź do wysyłki',
    /** Przy aktywnym linku: zapis zmienia to, co widzi klient. */
    linkNote: 'Klient ma link do tego raportu. Po zapisaniu zobaczy zmiany pod tym samym adresem.',
    error: 'Nie udało się zapisać raportu',
  },
  /** Przyczyna i naprawa — wspólne dla działań edytora. */
  errors: {
    session:
      'Sesja wygasła. Zaloguj się ponownie w nowej karcie i spróbuj jeszcze raz — ta karta zachowa zmiany.',
    notFound: 'Tego raportu nie ma na Twoim koncie. Wróć do listy klientów i otwórz raport jeszcze raz.',
    invalid: 'Raport ma niepoprawne dane. Odśwież stronę i spróbuj ponownie.',
    failed: 'Serwer nie odpowiedział. Sprawdź połączenie i spróbuj ponownie.',
    rateLimited: 'Za dużo nowych linków w krótkim czasie. Spróbuj ponownie za kilka minut.',
    /** Limit linków do jednego raportu (także wyłączonych). */
    linkQuota: (max: number) =>
      `Ten raport ma już ${formatNumber(max)} ${plural(max, ['link', 'linki', 'linków'])}, a to limit dla jednego raportu. Wyślij klientowi raport jako PDF.`,
  },
  send: {
    status: 'Status raportu',
    /** „Oznaczony jako wysłany 2 października 2026.” */
    sentOn: (date: string) => `Oznaczony jako wysłany ${date}.`,
    back: 'Wróć do edycji',
    /** Etykieta arkusza z raportem. */
    preview: 'Raport dla klienta',
    link: {
      title: 'Link do raportu',
      lead: 'Klient otworzy raport w przeglądarce, bez logowania. Link działa 12 miesięcy.',
      create: 'Utwórz link',
      created: 'Link utworzony',
      createNew: 'Utwórz nowy link',
      field: 'Adres linku',
      copy: 'Kopiuj link',
      /** toast.linkCopied */
      copied: 'Link skopiowany',
      copyFailed: 'Nie udało się skopiować linku. Zaznacz adres w polu i skopiuj go ręcznie.',
      /** „Link działa do 13 października 2027.” */
      expires: (date: string) => `Link działa do ${date}.`,
      /** „Link otwarto 3 razy.” */
      views: (n: number) => `Link otwarto ${formatNumber(n)} ${plural(n, ['raz', 'razy', 'razy'])}.`,
      revoke: 'Wyłącz link',
      revoked: 'Link wyłączony',
      revokedNote:
        'Link jest wyłączony. Pod starym adresem klient zobaczy komunikat, że raport nie jest już dostępny.',
      confirm: {
        title: 'Wyłączyć link?',
        body: 'Pod tym adresem klient zobaczy komunikat, że raport nie jest już dostępny. Potem możesz utworzyć nowy link.',
        cancel: 'Zostaw link',
      },
    },
    pdf: {
      title: 'PDF',
      lead: 'Plik do wysłania mailem albo w wiadomości. Powstaje w Twojej przeglądarce.',
      button: 'Pobierz PDF',
      downloaded: 'PDF pobrany',
      error: {
        title: 'Nie udało się utworzyć PDF',
        body: 'Odśwież stronę i spróbuj ponownie.',
      },
    },
    sent: {
      title: 'Wysyłka',
      lead: 'Oznacz raport jako wysłany, gdy klient dostanie link albo PDF. Panel klientów pokaże postęp miesiąca.',
      mark: 'Oznacz jako wysłany',
      /** toast.reportSent — „Raport dla Studio Lumi wysłany” */
      toast: (client: string) => `Raport dla ${client} wysłany`,
      undo: 'Cofnij',
      undoMark: 'Cofnij oznaczenie',
      undone: 'Oznaczenie cofnięte',
    },
  },
} as const;

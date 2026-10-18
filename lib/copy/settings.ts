/**
 * Teksty Ustawień /app/ustawienia (PROMPT.md §10 „Profil i marka (nazwa, logo), Plan i płatności, Eksport
 * i usunięcie danych”, §15 RODO; EkranCennik.html). Do SMM-owca na „Ty”, zdaniowa wielkość liter, bez emoji
 * i wykrzykników, bez form zależnych od płci. Przycisk i wynik nazywają się tak samo („Zapisz” → „Zapisano”,
 * „Wgraj logo” → „Logo wgrane”, „Usuń logo” → „Logo usunięte”). Błąd mówi przyczynę i naprawę.
 * Ceny przychodzą jako parametry z config/pricing.ts (nie wpisujemy ich w treść).
 */
import { plural } from '@/lib/i18n/pl';

/** Słowo, które trzeba wpisać, żeby usunąć konto. */
export const DELETE_CONFIRM_WORD = 'usuń';

export const settings = {
  meta: {
    title: 'Ustawienia',
  },
  heading: 'Ustawienia',
  loadError: {
    title: 'Nie udało się wczytać ustawień.',
    body: 'Dane konta nie dotarły z serwera. Odśwież stronę za chwilę.',
    retry: 'Odśwież stronę',
  },
  profile: {
    title: 'Profil i marka',
    /** „Logujesz się adresem anna@example.com.” */
    email: (email: string) => `Logujesz się adresem ${email}.`,
    displayName: {
      label: 'Twoje imię',
      hint: 'Nieobowiązkowe.',
    },
    brandName: {
      label: 'Nazwa na raporcie',
      hint: 'Pojawia się na górze raportu dla klienta, na przykład nazwa Twojej marki. Gdy dodasz logo, raport pokaże logo.',
    },
    submit: 'Zapisz',
    /** Wynik przycisku „Zapisz” (komunikat obok przycisku). */
    saved: 'Zapisano',
    errorTitle: 'Zmiany nie zostały zapisane.',
    errors: {
      displayNameTooLong: 'Imię ma więcej niż 80 znaków. Skróć je do 80.',
      brandNameTooLong: 'Nazwa ma więcej niż 80 znaków. Skróć ją do 80.',
      session: 'Sesja wygasła. Zaloguj się ponownie, a potem zapisz zmiany.',
      rateLimited: 'Zapisujesz zmiany zbyt często. Odczekaj kilka minut i spróbuj ponownie.',
      failed: 'Serwer nie zapisał zmian. Sprawdź połączenie i spróbuj ponownie.',
    },
  },
  logo: {
    title: 'Logo',
    lead: 'Logo pojawia się na górze raportów dla Twoich klientów, w miejscu nazwy na raporcie.',
    /** Opis podglądu (alt): „Twoje logo”. */
    alt: 'Twoje logo',
    none: 'Nie masz jeszcze logo. Raport pokazuje wtedy nazwę na raporcie.',
    upload: {
      title: 'Wgraj logo',
      hint: 'PNG, JPG albo WebP, do 2 MB. Bez SVG.',
      overTitle: 'Upuść plik, żeby wgrać logo',
      overHint: 'Jeden plik naraz.',
      button: 'Wybierz plik',
      retry: 'Wybierz inny plik',
    },
    /** Trwa wysyłanie (komunikat dla czytników i obok pola). */
    uploading: 'Wgrywam logo…',
    uploaded: 'Logo wgrane',
    remove: 'Usuń logo',
    removed: 'Logo usunięte',
    errorTitle: 'Logo nie zostało zmienione.',
    errors: {
      noFile: {
        title: 'Nie wybrano pliku',
        hint: 'Wybierz plik z logo: PNG, JPG albo WebP, do 2 MB.',
      },
      empty: {
        title: 'Plik jest pusty',
        hint: 'Zapisz logo ponownie w programie graficznym i wgraj nowy plik.',
      },
      tooBig: {
        title: 'Plik ma więcej niż 2 MB',
        hint: 'Zmniejsz logo, na przykład do 1000 px szerokości, i wgraj je ponownie.',
      },
      unsupported: {
        title: 'To nie jest plik PNG, JPG ani WebP',
        hint: 'Zapisz logo jako PNG albo JPG i wgraj je ponownie. Plików SVG nie przyjmujemy.',
      },
      session: 'Sesja wygasła. Zaloguj się ponownie, a potem zmień logo.',
      rateLimited: 'Logo zmieniało się zbyt często. Odczekaj kilka minut i spróbuj ponownie.',
      failed: 'Serwer nie zapisał zmiany logo. Sprawdź połączenie i spróbuj ponownie.',
    },
  },
  plan: {
    title: 'Plan',
    /** „Twój plan: Na start” */
    current: (name: string) => `Twój plan: ${name}`,
    /** Opis planu w wersji testowej (Faza 2: bez ograniczeń planu, docs/decisions.md, p. 94). */
    free: 'W wersji testowej raporty i linki działają dla wszystkich Twoich klientów. Raport ma stopkę „Przygotowano w Sedno”.',
    solo: 'Raporty i linki dla wszystkich Twoich klientów.',
    soon: 'Wkrótce',
    perMonth: 'netto / miesiąc',
    /** „do 10 klientów” (po „do” dopełniacz: „do 1 klienta”, „do 10 klientów”). */
    clients: (n: number) => `do ${n} ${plural(n, ['klienta', 'klientów', 'klientów'])}`,
    separator: ' · ',
    soloBody: 'Twoje logo zamiast stopki „Przygotowano w Sedno”. Plan uruchomimy razem z płatnościami.',
  },
  data: {
    title: 'Twoje dane',
    body: 'Plik JSON z Twoim profilem, klientami, raportami i linkami. Plików CSV nie zapisujemy, więc ich w nim nie ma.',
    download: 'Pobierz dane (JSON)',
  },
  deleteAccount: {
    title: 'Usuń konto',
    body: 'Usuniemy konto, klientów, raporty, linki i logo. Linki wysłane klientom przestaną działać. Tego nie da się cofnąć.',
    open: 'Usuń konto',
    modal: {
      title: 'Usunąć konto i wszystkie dane?',
      body: 'Usuniemy konto, klientów, raporty, linki i logo. Klienci, którzy mają link, zobaczą komunikat, że raport nie jest już dostępny. Tego nie da się cofnąć.',
      confirmLabel: `Wpisz „${DELETE_CONFIRM_WORD}”, żeby potwierdzić`,
      cancel: 'Zostaw konto',
      submit: 'Usuń konto i dane',
    },
    errorTitle: 'Konto nie zostało usunięte.',
    errors: {
      confirm: `Wpisz słowo „${DELETE_CONFIRM_WORD}”, żeby potwierdzić usunięcie konta.`,
      session: 'Sesja wygasła. Zaloguj się ponownie, a potem usuń konto.',
      rateLimited: 'Zbyt wiele prób usunięcia konta. Odczekaj kilka minut i spróbuj ponownie.',
      failed: 'Serwer nie usunął konta, konto nadal działa. Sprawdź połączenie i spróbuj ponownie.',
    },
  },
  signOut: {
    title: 'Wylogowanie',
    body: 'Wylogujesz się na tym urządzeniu.',
    button: 'Wyloguj się',
  },
} as const;

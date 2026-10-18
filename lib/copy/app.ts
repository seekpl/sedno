/**
 * Wspólne teksty obszaru konta (/app): nawigacja, powłoka strony. Teksty poszczególnych ekranów są w
 * osobnych plikach (auth, panel, editor, share, settings, history).
 */
export const app = {
  nav: [
    { key: 'klienci', href: '/app/klienci', label: 'Klienci' },
    { key: 'raporty', href: '/app/raporty', label: 'Raporty' },
    { key: 'ustawienia', href: '/app/ustawienia', label: 'Ustawienia' },
  ],
  /** Brak zasobu w /app (app/app/not-found.tsx): cudzy albo nieistniejący klient, zły miesiąc w adresie. */
  notFound: {
    heading: 'Tego nie ma na Twoim koncie',
    body: 'Klient albo raport pod tym adresem nie istnieje na Twoim koncie. Wróć do listy klientów i wybierz go stamtąd.',
    back: 'Przejdź do klientów',
  },
  /** Granica błędu /app (app/app/error.tsx): np. zerwane połączenie przy akcji formularza. */
  error: {
    heading: 'Ta strona się nie wczytała',
    title: 'Serwer nie odpowiedział.',
    body: 'Połączenie mogło się przerwać. Sprawdź internet i wczytaj stronę ponownie.',
    retry: 'Wczytaj ponownie',
  },
} as const;

export type AppSection = (typeof app.nav)[number]['key'];

/**
 * Teksty: lista oczekujących na start planu (docs/decisions.md, p. 17–18). Całość: lib/copy/pl.ts.
 * Do SMM-owca na „Ty”, zdaniowa wielkość liter, bez wykrzykników. Przycisk i wynik nazywają się tak samo:
 * „Zapisz mnie na listę” → „Zapisano na listę”. Błąd mówi przyczynę i naprawę, nie przeprasza.
 * Nazwa planu pochodzi z config/pricing.ts (bez cen w treści).
 */
export const waitlist = {
  /** Etykieta formularza dla czytników ekranu: „Lista oczekujących na plan Solo”. */
  formLabel: (planName: string) => `Lista oczekujących na plan ${planName}`,
  email: {
    label: 'Adres e-mail',
  },
  consent: {
    /** Tekst zgody: jedna wiadomość o starcie planu i link do polityki prywatności. */
    before: (planName: string) =>
      `Zgadzam się na jedną wiadomość e-mail o starcie planu ${planName}. Szczegóły w `,
    link: 'polityce prywatności',
    after: '.',
  },
  submit: 'Zapisz mnie na listę',
  success: {
    title: 'Zapisano na listę',
    body: (planName: string) => `Napiszemy jeden raz, gdy plan ${planName} wystartuje.`,
  },
  error: {
    /** Tytuł komunikatu, gdy zapis się nie udał; treść niesie przyczynę i naprawę. */
    title: 'Nie zapisano na listę',
  },
  errors: {
    emailRequired: 'Wpisz adres e-mail.',
    emailInvalid:
      'Nie rozpoznajemy tego adresu e-mail. Sprawdź znak @ i domenę, na przykład imie@firma.pl. Adres musi być zapisany bez polskich liter.',
    emailTooLong: 'Adres e-mail jest za długi. Wpisz adres, który ma do 254 znaków.',
    consentRequired: 'Zaznacz zgodę. Bez niej nie możemy napisać do Ciebie o starcie planu.',
    invalidPlan: 'Formularz nie wskazuje planu. Odśwież stronę i zapisz się ponownie.',
    rateLimited:
      'Z tego połączenia było już kilka zapisów w ostatnich minutach. Spróbuj ponownie za 10 minut.',
    unavailable:
      'Lista chwilowo nie działa, więc adres nie został zapisany. Spróbuj później albo napisz do nas przez stronę Kontakt.',
    failed:
      'Serwer nie zapisał adresu. Spróbuj ponownie za kilka minut, a jeśli to się powtórzy, napisz do nas przez stronę Kontakt.',
  },
} as const;

/**
 * Teksty logowania przez link e-mail (PROMPT.md §10, §14: auth.email.subject, auth.checkInbox) i szablonów
 * e-maili Supabase Auth (scripts/build-email-templates.ts). Do SMM-owca na „Ty”, bez form zależnych od płci,
 * zdaniowa wielkość liter, bez wykrzykników. Przycisk i wynik nazywają się tak samo: „Wyślij link” →
 * „Wysłaliśmy link”. Błąd mówi przyczynę i naprawę. Nigdy nie zdradzamy, czy konto z danym adresem istnieje.
 *
 * Plik bez importów: czyta go też skrypt generujący szablony e-maili (tsx, poza Next.js).
 */

/** Czas ważności linku w tekstach. Musi odpowiadać konfiguracji Supabase (otp_expiry = 3600 s). */
export const LINK_VALID_FOR = 'przez godzinę';

export const auth = {
  meta: {
    title: 'Zaloguj się',
    description: 'Logowanie do Sedno linkiem wysłanym na adres e-mail, bez hasła.',
  },
  form: {
    title: 'Zaloguj się',
    lead: 'Bez hasła: wpisz adres e-mail, a wyślemy na niego link do logowania. Nowe konto powstaje przy pierwszym logowaniu.',
    label: 'Formularz logowania',
    email: { label: 'Adres e-mail' },
    submit: 'Wyślij link',
    /** Linia prawna pod formularzem: fakty, bez obietnic (teksty prawne to szkice). */
    legal: {
      before: 'Logując się, akceptujesz ',
      terms: 'regulamin',
      middle: '. Co robimy z adresem e-mail, opisuje ',
      privacy: 'polityka prywatności',
      after: '.',
    },
  },
  /** /logowanie?blad=link — link z e-maila wygasł, był użyty albo otwarto go w innej przeglądarce. */
  linkError: {
    title: 'Link do logowania nie działa',
    body: 'Link wygasł, został już użyty albo otwarto go w innej przeglądarce niż ta, w której wpisano adres. Wyślij nowy link i otwórz go na tym samym urządzeniu.',
  },
  checkInbox: {
    title: 'Sprawdź skrzynkę',
    /** auth.checkInbox (PROMPT.md §14). */
    body: (email: string) =>
      `Wysłaliśmy link na ${email}. Otwórz go na tym urządzeniu. Link działa ${LINK_VALID_FOR}.`,
    spam: 'Nie ma wiadomości? Sprawdź folder Spam albo wyślij link ponownie.',
    resend: 'Wyślij ponownie',
    /** Wynik „Wyślij ponownie”: nowy link unieważnia poprzedni (Supabase przechowuje jeden). */
    resent: 'Wysłaliśmy nowy link. Poprzedni już nie działa.',
    change: 'Użyj innego adresu',
  },
  error: {
    /** Tytuł komunikatu, gdy link nie wyszedł; treść niesie przyczynę i naprawę. */
    title: 'Nie wysłano linku',
  },
  errors: {
    emailRequired: 'Wpisz adres e-mail.',
    emailInvalid:
      'Nie rozpoznajemy tego adresu e-mail. Sprawdź znak @ i domenę, na przykład imie@firma.pl. Adres musi być zapisany bez polskich liter.',
    emailTooLong: 'Adres e-mail jest za długi. Wpisz adres, który ma do 254 znaków.',
    rateLimitedIp:
      'Z tego połączenia wysłano już kilka linków w ostatnich minutach. Spróbuj ponownie za 10 minut.',
    rateLimitedEmail:
      'Na ten adres wysłaliśmy już kilka linków w ostatnich minutach. Otwórz najnowszy z nich albo spróbuj ponownie za 10 minut.',
    /** Limit dostawcy poczty (Supabase Auth: jeden e-mail na adres co minutę). */
    providerRateLimited: 'Link na ten adres wyszedł przed chwilą. Odczekaj minutę i wyślij ponownie.',
    failed:
      'Serwer nie wysłał linku. Spróbuj ponownie za kilka minut, a jeśli to się powtórzy, napisz do nas przez stronę Kontakt.',
  },
  /** E-mail z linkiem (szablony magic-link.html i confirmation.html mają tę samą treść). */
  email: {
    /** auth.email.subject (PROMPT.md §14). */
    subject: 'Twój link do logowania w Sedno',
    /** Tekst podglądu w skrzynce (ukryty w treści). */
    preheader: `Link działa ${LINK_VALID_FOR}. Otwórz go w przeglądarce, w której poproszono o link.`,
    brand: 'Sedno',
    heading: 'Zaloguj się do Sedno',
    intro: `Kliknij przycisk, żeby się zalogować. Link działa ${LINK_VALID_FOR}. Otwórz go na tym samym urządzeniu i w tej samej przeglądarce, w której poproszono o link.`,
    button: 'Zaloguj się',
    fallback: 'Jeśli przycisk nie działa, skopiuj ten adres do paska przeglądarki:',
    ignore:
      'Jeśli to nie Ty prosisz o link, zignoruj tę wiadomość. Bez kliknięcia w link nikt się nie zaloguje.',
    automatic: 'Wiadomość wysłana automatycznie. Nie odpowiadaj na nią.',
  },
} as const;

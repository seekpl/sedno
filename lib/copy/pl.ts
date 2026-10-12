/**
 * Wszystkie teksty interfejsu (PROMPT.md §14). Ton: brand/docs/4-komunikacja.md.
 * Do SMM-owca na „Ty”, raport bezosobowo, zdaniowa wielkość liter, bez emoji i wykrzykników.
 */
export const copy = {
  meta: {
    description:
      'Sedno zamienia eksport z Meta Business Suite w miesięczny raport dla lokalnej firmy: telefony, dojazdy i rezerwacje na górze, zasięgi niżej.',
  },
  landing: {
    h1: 'Raport, który klient rozumie',
  },
  legal: {
    meta: 'Sedno nie jest powiązane z Meta Platforms, Inc. Instagram i Meta Business Suite są znakami towarowymi Meta Platforms, Inc. i występują tu wyłącznie w celu opisania, z jakich plików korzysta narzędzie.',
  },
  ui: {
    logo: 'Sedno',
    month: 'Miesiąc',
    prevMonth: 'Poprzedni miesiąc',
    nextMonth: 'Następny miesiąc',
    prevPage: 'Poprzednia strona',
    nextPage: 'Następna strona',
    appNav: 'Główna',
    siteNav: 'Strona',
    status: {
      draft: 'Szkic',
      ready: 'Gotowy',
      sent: 'Wysłany',
      noExport: 'Brak eksportu',
      fileError: 'Błąd pliku',
    },
  },
  app: {
    sections: [
      { href: '/app/klienci', label: 'Klienci' },
      { href: '/app/raporty', label: 'Raporty' },
      { href: '/app/ustawienia', label: 'Ustawienia' },
    ],
  },
  nav: {
    home: 'Sedno, strona główna',
    menu: 'Menu',
    site: [
      { href: '/#jak-to-dziala', label: 'Jak to działa' },
      { href: '/#cennik', label: 'Cennik' },
      { href: '/#narzedzia', label: 'Darmowy szablon' },
    ],
    login: 'Zaloguj się',
  },
  cta: {
    primary: 'Zrób pierwszy raport',
    secondary: 'Zobacz przykładowy raport',
  },
  footer: {
    links: [
      { href: '/prywatnosc', label: 'Polityka prywatności' },
      { href: '/regulamin', label: 'Regulamin' },
      { href: '/kontakt', label: 'Kontakt' },
    ],
    navLabel: 'Informacje',
  },
} as const;

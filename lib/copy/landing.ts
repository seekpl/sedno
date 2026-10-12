/**
 * Strona główna (PROMPT.md §12, brand/docs/5-ekrany.md). Faza 1: mówimy tylko o tym, co działa —
 * raport PDF bez konta (docs/decisions.md, p. 17). Teksty o linku, logo i historii dopiero z kontami.
 * Ceny wyłącznie z config/pricing.ts — tu tylko słowa wokół nich.
 */
export const landing = {
  hero: {
    h1: 'Raport, który klient rozumie',
    lead: 'Wgrywasz eksport z Meta Business Suite, dopisujesz trzy liczby i pobierasz PDF dla klienta. Na górze raportu: ile osób chciało zadzwonić, dojechać i się umówić.',
    privacy: 'Bez zakładania konta. Plik zostaje w Twojej przeglądarce.',
    flowLabel: 'Jak powstaje raport',
    flow: {
      file: {
        step: '1. Eksport z Meta Business Suite',
        fileName: 'posty-wrzesien.csv',
        posts: '31 publikacji',
      },
      numbers: { step: '2. Trzy liczby z panelu' },
      send: { step: '3. Pobierz PDF', button: 'Pobierz PDF' },
    },
    phoneLabel: 'Przykładowy raport na telefonie',
  },
  how: {
    title: 'Jak to działa',
    steps: [
      {
        title: 'Wgraj eksport',
        body: 'Plik CSV z Meta Business Suite: Statystyki → Treści → Eksportuj dane. Nie musisz łączyć kont klientów.',
      },
      {
        title: 'Dopisz efekty',
        body: 'Trzy liczby z panelu profesjonalnego: kliknięcia „Zarezerwuj”, „Zadzwoń” i „Wyznacz trasę”. Do tego dwa zdania o tym, co zadziałało.',
      },
      {
        title: 'Pobierz PDF',
        body: 'Raport powstaje w Twojej przeglądarce. Wysyłasz go klientowi tak, jak chcesz. Na górze klient widzi, ile osób chciało się umówić, a zasięgi niżej.',
      },
    ],
  },
  effects: {
    title: 'Efekty przed zasięgami',
    body: 'Właścicielka salonu nie płaci za wyświetlenia. Płaci za to, że ktoś zadzwonił albo kliknął „Zarezerwuj”. Sedno stawia te liczby na górze i tłumaczy resztę jednym zdaniem.',
    typical: {
      label: 'Typowy raport',
      rows: [
        { label: 'Zasięg', value: 3920 },
        { label: 'Wyświetlenia', value: 12480 },
        { label: 'Interakcje', value: 611 },
      ],
      engagementLabel: 'Współczynnik zaangażowania',
      engagement: '4,9%',
    },
    sedno: {
      label: 'Raport Sedno',
      value: 23,
      caption: 'osoby kliknęły „Zarezerwuj”',
      rest: '9 osób zadzwoniło, 14 sprawdziło dojazd',
    },
  },
  brand: {
    title: 'Twoja marka na raporcie',
    badge: 'Wkrótce w planie Solo',
    body: 'W planie Solo raport otworzy Twoje logo i nazwa klienta, a nasza stopka zniknie.',
  },
  privacy: {
    title: 'Pliki i prywatność',
    body: 'Plik CSV czyta Twoja przeglądarka i nie wysyła go na serwer. Raport i PDF też powstają w przeglądarce. Zapisujemy tylko anonimowe liczby użycia, na przykład że plik został wczytany, bez jego treści.',
  },
  pricing: {
    title: 'Cennik',
    lead: 'Płacisz Ty, nie Twoi klienci.',
    now: 'Teraz: za darmo, PDF ze stopką »Przygotowano w Sedno«.',
    soon: 'Wkrótce',
    mostPopular: 'Najczęściej wybierany',
    perMonth: 'netto / miesiąc',
    /** „do 10 klientów” */
    clients: (n: number) => `do ${n} klientów`,
    free: {
      caption: 'bez konta',
      features: [
        'Raport PDF bez zakładania konta',
        'Stopka „Przygotowano w Sedno”',
        'Plik czytany w przeglądarce',
      ],
      cta: 'Zrób pierwszy raport',
    },
    solo: {
      features: [
        'Link do raportu dla klienta',
        'Twoje logo zamiast naszej stopki',
        'Historia i porównanie miesięcy',
      ],
    },
    studio: {
      features: ['Wszystko z Solo', 'Kolor Twojej marki w raporcie', 'Kilka osób w zespole'],
    },
    notify: 'Powiadom mnie o starcie',
    /** „Wkrótce także pojedynczy raport bez abonamentu: 9 zł netto.” */
    single: (price: string) => `Wkrótce także pojedynczy raport bez abonamentu: ${price} netto.`,
    footnote: 'Ceny netto, doliczamy 23% VAT. Płatności uruchomimy razem z planem Solo.',
  },
  faq: {
    title: 'Pytania',
    contactLead: 'Nie ma tu odpowiedzi?',
    contactLink: 'Napisz do nas',
    items: [
      {
        q: 'Czy muszę łączyć konta moich klientów?',
        a: 'Nie. Sedno czyta plik, który eksportujesz sam z Meta Business Suite. Nie prosimy o hasła ani dostęp do profili.',
      },
      {
        q: 'Skąd wziąć trzy liczby z „efektami”?',
        a: 'Z panelu profesjonalnego Instagrama, w statystykach kontaktów. Poradnik ze zrzutami ekranu przygotowujemy.',
      },
      {
        q: 'Czy mogę wysłać klientowi link?',
        a: 'Już wkrótce. Na razie raport pobierasz jako PDF i wysyłasz go, jak chcesz.',
      },
      {
        q: 'Czy Sedno jest narzędziem Mety?',
        a: 'Nie. Sedno nie jest powiązane z Meta Platforms ani z Instagramem. Korzysta z plików, które eksportujesz.',
      },
    ],
  },
  tools: {
    title: 'Darmowe narzędzia',
    available: 'Dostępne',
    soon: 'Wkrótce',
    template: {
      title: 'Szablon raportu z Instagrama dla klienta',
      body: 'Arkusz i szablon w Canvie z tym samym układem co Sedno. Do pobrania bez rejestracji.',
      link: 'Pobierz szablon',
    },
    calculator: {
      title: 'Kalkulator wyceny prowadzenia profilu',
      body: 'Policz stawkę za pakiet postów, rolek i dojazdów na sesje.',
    },
  },
  ctaBand: {
    /** „Zrób klientowi raport za wrzesień jeszcze dziś” */
    title: (monthNom: string) => `Zrób klientowi raport za ${monthNom} jeszcze dziś`,
  },
  example: {
    badge: 'Dane przykładowe',
    title: 'Przykładowy raport',
    lead: 'Tak wygląda raport, który dostaje klient: na telefonie i w PDF. Dane i marki są przykładowe.',
    cta: 'Zrób własny raport',
  },
} as const;

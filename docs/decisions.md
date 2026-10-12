# Decyzje i założenia

Każde założenie przyjęte bez odpowiedzi właściciela. Format: data, decyzja, powód, co może ją zmienić.

## Faza 0 — fundament (12.10.2026)

1. **TypeScript 6.0, nie 7.x.** Next 16.4 umie sprawdzać typy przez CLI także z TS 7, ale `typescript-eslint` (część `eslint-config-next`) potrzebuje JavaScriptowego API TypeScriptu, którego natywny TS 7 nie ma. Zmiana: gdy `typescript-eslint` wesprze TS 7.
2. **`@playwright/test` 1.56.1.** Ta wersja pasuje do przeglądarki zainstalowanej w środowisku (`/opt/pw-browsers`, chromium-1194). W CI przeglądarkę instaluje `playwright install`.
3. **Paczka `sedno-brand-kit.zip` nie trafia do repozytorium.** Źródłem prawdy jest rozpakowany katalog `brand/` (tylko do odczytu).
4. **Pliki wygenerowane są w repozytorium** (`styles/tokens.css`, `lib/brand/tokens.generated.ts`, `lib/brand/svg.generated.ts`, kopie fontów i ikon w `public/`). Testy (`tests/unit/tokens.test.ts`, `brand-files.test.ts`) pilnują, że są aktualne i zgodne bajtowo z `brand/`. Dzięki temu build nie zależy od kroku generowania.
5. **`lib/brand/tokens.generated.ts`** — te same wartości tokenów jako stałe TS dla miejsc bez zmiennych CSS (PDF, manifest, `theme-color`). W CSS zawsze `var(--…)`.
6. **Ikony, logo i pętla zakreślenia jako dane** (`lib/brand/svg.generated.ts`), rysowane przez `<Icon>`, `<Logo>`, `<Circled>` w HTML i przez `react-pdf` w PDF. Ścieżka pętli pochodzi z `brand/reference/components/Circled.html` (jedyna w makietach).
7. **Strażnik marki** (`tests/unit/brand-guard.test.ts`) odrzuca kolory, cienie, promienie i gradienty spoza tokenów w CSS Modules i stylach inline. Wyjątek: wartość przepisana z makiety z komentarzem `ref: brand/reference/…` — dziś tylko ramka telefonu (promień 44 px) z ekranów raportu.
8. **Niedostępne przyciski** mają `aria-disabled="true"` (nigdy natywne `disabled`), są osiągalne z klawiatury i wyjaśniają, czego brakuje (Tooltip lub tekst obok, przez `aria-describedby`).
9. **CSP bez nonce**: `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`. Strony marketingowe mają być statyczne, a nonce wymusza renderowanie dynamiczne. `'wasm-unsafe-eval'` jest potrzebne silnikowi układu w `@react-pdf/renderer`. Do ponownej oceny przed startem (opcja: nonce tylko dla `/app`).
10. **Menu mobilne strony na `<details>`** — działa bez JavaScriptu (PROMPT.md §12).
11. **`ToastProvider` tylko w układach narzędzia i aplikacji**, nie w głównym layoucie, żeby strona główna nie ładowała zbędnego JavaScriptu.
12. **Różnica wobec podglądów komponentów:** makiety w `brand/reference/components/` nie zerują marginesów `<p>` (domyślne 1em przeglądarki), a ekrany w `brand/reference/screens/` zerują. Aplikacja zeruje, jak ekrany — stąd minimalnie mniejszy odstęp pod linią prywatności w podglądzie Upload.
13. **Flagi funkcji** (`config/features.ts`): `accounts`, `payments`, `waitlist` = `false`, dopóki funkcje nie działają. Teksty i przyciski zależne od nich (np. „Zaloguj się”) pokazują się dopiero po włączeniu (PROMPT.md §2.5).
14. **Rozmiar logo na stronie w telefonie: 22 px** (jak w `EkranLandingMobile.html`), na komputerze 28 px (PROMPT.md §13).

## Faktury

- **Nie generujemy faktur.** W MVP klient dostaje potwierdzenie płatności ze Stripe. Faktury wystawia właściciel w swoim systemie fakturowym zgodnym z KSeF (od 1.04.2026; najmniejsi od 1.01.2027). Integracja po decyzji właściciela i księgowej (PROMPT.md §9).

## Decyzje właściciela po Fazie 0 (12.10.2026)

15. **TypeScript: najnowszy 6.x, z regułami lintu opartymi na typach.** _Do przeglądu:_ przejście na TS 7, gdy `typescript-eslint` ogłosi wsparcie.
16. **CSP rozdzielone według tras** (zastępuje punkt 9):
    - **Strony marketingowe** (`/`, `/przyklad`, `/szablon`, `/poradniki/*`, strony prawne): statyczne, `script-src 'self' 'unsafe-inline'`, bez `'unsafe-eval'`.
    - **`/nowy`, `/app/*`, `/r/*`, `/logowanie`**: nonce + `'strict-dynamic'` z `proxy.ts` (Next 16: dawny middleware), renderowanie dynamiczne. `/nowy` przetwarza CSV, więc nie dostaje `'unsafe-inline'` w `script-src`.
    - **Wszędzie**: `default-src 'self'`; `connect-src 'self'` + tylko niezbędne hosty (Supabase; Stripe od Fazy 3); `img-src 'self' data: blob:`; `worker-src 'self' blob:`; `object-src 'none'`; `base-uri 'none'`; `form-action 'self'`; `frame-ancestors 'none'`. Na `/nowy` `connect-src` wyłącznie `'self'`.
    - **`'wasm-unsafe-eval'`** tylko na trasach, które generują PDF, i tylko jeśli `@react-pdf/renderer` go wymaga (wynik sprawdzenia: punkt 20).
    - **Permalinki z CSV**: przepuszczamy wyłącznie `https://www.instagram.com/…`, resztę odrzucamy (ochrona przed `javascript:` w `href`).
    - **Test Playwright**: każda trasa ładuje się bez zdarzeń `securitypolicyviolation` i z właściwym nagłówkiem CSP.
    - _Przed startem_: sprawdzić, czy SRI/hashe w aktualnym Next.js (eksperymentalne `experimental.sri`) pozwalają usunąć `'unsafe-inline'` także z części marketingowej (pozycja w `docs/launch-checklist.md`).
17. **Faza 1: strona mówi tylko o tym, co działa — raport PDF bez konta.** Hero, linia prywatności, cennik („Teraz: za darmo…”, Solo „Wkrótce” z ceną z `config/pricing.ts` i „Powiadom mnie o starcie”, Studio „Wkrótce”), FAQ („Czy mogę wysłać klientowi link?” zamiast pytania o konto klienta), sekcja „Twoja marka na raporcie” oznaczona „Wkrótce w planie Solo”. Teksty w `lib/copy/pl.ts`.
18. **Do Fazy 1 przechodzą z Faz 3–4**: tabele `waitlist` i `events` (Supabase bez auth, zapis przez Server Action z kluczem serwisowym i limitem), formularz listy oczekujących (e-mail + zgoda + link do polityki prywatności) i zdarzenia z §16. Test prywatności obejmuje te punkty: żadne zdarzenie nie zawiera treści pliku.
19. **Fixtures**: pracujemy na syntetycznych. Prawdziwe eksporty trafiają do `tests/fixtures/private/` (w `.gitignore`); skrypt robi z nich zanonimizowane kopie `real-*.csv` (bez opisów i permalinków). Do tego czasu mapowanie ręczne kolumn musi działać z każdym plikiem. Warunek publicznego startu (w `docs/launch-checklist.md`): wszystkie prawdziwe pliki przechodzą bez mapowania ręcznego.
20. **Arkusze porównawcze** po każdej fazie: pełne wersje w `docs/review/faza-N.zip` + lista rozbieżności słowami (co, gdzie, czy poprawione).

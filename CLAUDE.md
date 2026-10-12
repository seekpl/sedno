# Sedno — zasady obowiązujące w każdej sesji

Polskie narzędzie dla SMM-owców: eksport CSV z Meta Business Suite + trzy liczby z panelu profesjonalnego Instagrama → miesięczny raport dla właściciela lokalnej firmy. Pełna specyfikacja: `PROMPT.md`. Decyzje i założenia: `docs/decisions.md` (dopisuj każde nowe założenie).

## Niezmienne zasady (PROMPT.md §2)

1. **Plik CSV nigdy nie opuszcza przeglądarki.** Parsowanie w Web Workerze. Na serwer trafia wyłącznie zagregowany `ReportData` (liczby z podsumowania, komentarz, trzy liczby efektów, top publikacje: data, typ, wyświetlenia, interakcje, opcjonalny permalink). Nigdy opisy postów, surowe wiersze ani plik. Pilnuje tego test e2e prywatności (znacznik `SEDNO-PRIVACY-CANARY-7f3a`).
2. **Bez konta wszystko dzieje się w przeglądarce** (raport + PDF). Link, historia i logo wymagają konta.
3. **Raport dla klienta zawsze jasny**: `sd-report` + `data-theme="light"`.
4. **Żadnych integracji z Meta/Instagram API**, scrapingu, logowania przez Instagram. Bez logo/gradientu Instagrama, bez „Insta”/„Gram” w nazwach. Instagram i Meta Business Suite tylko opisowo.
5. **Nie pokazuj jako dostępnej funkcji, której nie ma.** Studio i kalkulator wyceny = „Wkrótce”. Szablon „Dostępne” tylko gdy `NEXT_PUBLIC_TEMPLATE_URL` jest ustawione.
6. **Bez zmyślonych danych marketingowych**: żadnych opinii, liczników użytkowników, logotypów firm, „100%”, „AI”, „w 5 minut”. Przykłady oznaczone jako przykładowe.
7. **Wygląd wyłącznie z `brand/`.** Bez Tailwinda, shadcn, MUI ani innych zestawów UI. Bez nowych kolorów, cieni, promieni spoza tokenów. Komponenty React tylko nakładają klasy `sd-*` z `brand/components.css` (markup jak w `brand/reference/components/*.html`). Układ stron: CSS Modules, wartości wyłącznie przez `var(--…)`.
8. **Polski język i typografia**: cudzysłowy „ ” i » «, `Intl` z `pl-PL`, odmiana liczebników przez `plural()` z `lib/i18n/pl.ts`. Liczby, kwoty i daty w Bricolage z cyframi tabelarycznymi (`sd-num`).

## Wdrożenie systemu marki (§13)

- `brand/` jest tylko do odczytu. Nigdy go nie edytuj.
- `styles/tokens.css` generuje `pnpm tokens` (`scripts/build-tokens.ts`) z `brand/tokens.json`; fonty WOFF2 w `public/fonts/`. Wygenerowanego pliku nie edytuj ręcznie. `app/globals.css` importuje kolejno `styles/tokens.css` i `brand/components.css`. Preload Bricolage.
- Komponenty w `components/ui/` (Button, TextField, NumberField, Upload, FileChip, Badge, Alert, Toast+provider, Modal, DataTable, Tooltip, AppNav, MonthSwitcher, Pagination, EmptyState, Skeleton, Progress, KeyNumber, Metric, Circled, Mark, Icon, Logo). Warianty przez propsy, nie przez nowe style.
- Ikony generowane z `brand/icons/*.svg` (`stroke="currentColor"`). Dekoracyjna: `aria-hidden`; sama ikona bez tekstu: `aria-label`.
- `<Logo variant="default|on-dark|mono-ink|mono-white" height>`: pasek aplikacji 24 px, strona 28 px, stopka raportu 12–14 px. Zakazy w `brand/docs/3-logo.md`.
- `/dev/komponenty` tylko poza produkcją.

## Teksty (§14)

- Wszystkie teksty UI w `lib/copy/pl.ts`. Odmiana i formaty w `lib/i18n/pl.ts` (z testami).
- Do SMM-owca na „Ty”; raport bezosobowo (bez „Ty”, bez „Pan/Pani”). Zdaniowa wielkość liter, bez emoji i wykrzykników.
- Przycisk i wynik nazywają się tak samo („Kopiuj link” → „Link skopiowany”). Błąd mówi przyczynę i naprawę, nie przeprasza.
- Liczby: `Intl.NumberFormat('pl-PL')` (twarda spacja od 5 cyfr, 4 cyfry bez spacji). Kwoty: PLN. Daty „1–30 września 2026” (półpauza). Minus „−” (U+2212). Brak danych to „—”, nigdy 0.
- Ceny wyłącznie z `config/pricing.ts`.

## Dostępność, wydajność, bezpieczeństwo, RODO (§15)

- WCAG 2.2 AA: widoczny fokus, etykiety nad polami, błędy przez `aria-describedby`, cele dotyku 48 px na telefonie, cały przepływ z klawiatury, modal z pułapką fokusu i Esc, `prefers-reduced-motion`, status zawsze słowem i ikoną, niedostępny przycisk przez `aria-disabled` + wyjaśnienie. Axe bez naruszeń serious/critical.
- Strona główna: Lighthouse mobile ≥ 90, LCP < 2,5 s, JS < 80 KB gzip. PapaParse i `@react-pdf/renderer` tylko importem dynamicznym (`/nowy`, edytor).
- Nagłówki: CSP, HSTS, `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`. Tokeny linków ≥ 128 bitów z CSPRNG. `zod` na wejściu każdej Server Action. Logo: PNG/JPEG/WebP ≤ 2 MB, bez SVG. Nie loguj treści raportów ani e-maili.
- RODO: minimalizacja danych, dane w UE, eksport i usunięcie konta. Teksty prawne tylko z `[DO UZUPEŁNIENIA przez prawnika]`.

## Czego nie robić (§20)

- Nie wysyłaj CSV ani jego fragmentów na serwer, do logów, analityki ani zewnętrznych API.
- Nie łącz się z Meta/Instagram API, nie proś o hasła/tokeny klientów, nie scrapuj.
- Bez logo/gradientu Instagrama, bez „Insta”/„Gram”, bez sugerowania współpracy z Metą.
- Bez Tailwinda, bibliotek komponentów, nowych kolorów, gradientów dekoracyjnych, glassmorphismu, emoji.
- Bez AI w komentarzach i tytułach (MVP).
- Bez zmyślonych opinii, liczby użytkowników, logotypów klientów, statystyk.
- Nie oznaczaj niedziałających funkcji jako dostępnych. Nie wpisuj cen w treść.
- Nie sumuj zasięgu z publikacji (w raporcie „Wyświetlenia”, nie zasięg).
- Nie generuj faktur VAT. Nie pisz ostatecznych tekstów prawnych.
- Nie edytuj plików w `brand/`.

## Sposób pracy

- Fazy z `PROMPT.md` §18. Po każdej fazie: lista kryteriów (spełnione/niespełnione), zrzuty 390 px i 1280 px obok `brand/reference/`, otwarte pytania, commit.
- „Gotowe” = `pnpm lint && pnpm typecheck && pnpm test && pnpm build` + e2e fazy zielone, brak stylów spoza `brand/`, teksty z `lib/copy/pl.ts`, zaktualizowane `docs/decisions.md`.
- Każda funkcja ma test. Każda obietnica w UI (np. „plik zostaje w przeglądarce”) ma test, który ją sprawdza.
- Przed uznaniem ekranu za skończony porównaj zrzut z makietą z `brand/reference/`.
- Niepewność → najprostsze rozsądne założenie w `docs/decisions.md` i dalej. Blokuj się tylko na decyzjach nieodwracalnych.

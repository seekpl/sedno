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

## Faza 1 — wyniki modułów (12.10.2026)

### Bezpieczeństwo i CSP

21. **`'wasm-unsafe-eval'` na trasach z PDF** (`/nowy`, `/app`, `/r`): `@react-pdf/renderer` 4.9 układa strony silnikiem yoga-layout 3.2.1, który kompiluje WebAssembly; bez tej dyrektywy PDF nie powstaje. Nie dopuszcza `eval()` ani `new Function()` (sprawdzone: react-pdf, pdfkit i fontkit ich nie używają). Na stronach marketingowych i `/logowanie` go nie ma.
22. **Znane zdarzenie CSP przy pierwszym PDF:** yoga najpierw próbuje `fetch()` własnego adresu `data:` z WebAssembly; przy `connect-src 'self'` na `/nowy` przeglądarka zgłasza jedno `securitypolicyviolation` (`connect-src`, `data:`), a yoga przechodzi na dekodowanie w pamięci i PDF powstaje. Zgodnie z decyzją 16 `connect-src` na `/nowy` zostaje `'self'`; test e2e dopuszcza wyłącznie to jedno, nazwane zdarzenie przy generowaniu PDF (ładowanie każdej trasy — bez żadnych). _Pytanie do właściciela_: dodanie `data:` do `connect-src` na trasach z PDF usunęłoby zgłoszenie (przez `data:` nie da się nic wysłać).
23. **Na trasach z nonce atrybuty `style=""` dopuszcza `style-src-attr 'unsafe-inline'`** (nonce nie obejmuje atrybutów; szerokości słupków raportu są danymi). Elementy `<style>` wymagają nonce.
24. **Jedno źródło granic danych** w `lib/report/limits.ts` (wzorzec permalinku `https://www.instagram.com/…`, maks. 300 znaków, maks. liczba 1 000 000 000) — używają go schemat raportu, parser i obliczenia, bez importu zod w Web Workerze.
25. **Logo autora tylko z `https:`** (`author.logoUrl`), żeby do `<img src>` nie trafiło `javascript:`, `data:` ani `http:`.

### Parser CSV (`lib/csv/`)

26. Nagłówek to pierwszy wiersz z co najmniej 3 różnymi znanymi polami (opis się liczy); gdy takiego nie ma, ekran „Przypisz kolumny” dostaje wiersz o najczęstszej liczbie pól. Separator: `,`, `;` lub tabulator — wygrywa ten, przy którym znajdujemy nagłówek, potem spójność liczby pól.
27. Gdy dwie kolumny pasują do jednego pola, wygrywa synonim wcześniej na liście („Czas publikacji”/„Publish time” przed „Data”/„Date”, bo eksport ma też kolumnę „Date” z wartością „Lifetime”); mapowanie ręczne ma pierwszeństwo. Kolumna daty bez żadnej daty → `E_MISSING_COLUMNS` (publishedAt), nie `E_EMPTY`.
28. Dodatkowe hipotezy synonimów: „publish date”, „opublikowano”, „reactions”, „typ treści”, „typ publikacji”, „type”; jako opis (tylko żeby go nie czytać): „caption”, „podpis”, „title”, „tytuł”. „Impressions” i „Plays” nigdy nie trafiają do wyświetleń. Wszystko do potwierdzenia na prawdziwych plikach (punkt 19).
29. Liczby ujemne i komórki nieliczbowe to `null`, nie 0; ułamki w licznikach zaokrąglamy. „1,234” i „1.234” to tysiące tylko przy 1–3 cyfrach przed jedynym separatorem bez zera na początku.
30. Godzina bez strefy to czas warszawski; godzina z luki wiosennej przesuwa się o godzinę do przodu, podwójna jesienna oznacza wcześniejszą chwilę. Kolejność dnia i miesiąca rozstrzygamy dla całej kolumny, przy remisie decyduje separator („/” — miesiąc najpierw, „.” i „-” — dzień najpierw).
31. Plik bez BOM czytamy jako windows-1250 tylko wtedy, gdy bajty nie są poprawnym UTF-8, a znaków zastępczych jest więcej niż poprawnych znaków spoza ASCII (pojedynczy uszkodzony bajt nie przełącza pliku). ISO-8859-2 czytamy jak windows-1250 (do ponownej oceny). UTF-16 LE bez BOM rozpoznajemy po bajtach zerowych.
32. Kolejność kontroli pliku: rozszerzenie i MIME (`E_NOT_CSV`), rozmiar (`E_TOO_BIG`), limit 20 000 niepustych wierszy pod nagłówkiem, dopiero potem kolumny. Plik złożony tylko z separatorów i białych znaków to `E_EMPTY`. MIME `application/octet-stream` jest odrzucany zgodnie z §6 (do obserwacji).
33. Parser działa w Web Workerze; gdy worker nie startuje, parsujemy w wątku głównym przez import dynamiczny — plik nadal nie opuszcza przeglądarki.
34. Zapamiętane mapowanie kolumn (`localStorage`, `sedno.columnMapping.v1`): tylko znane pola, nagłówki do 120 znaków, najwyżej 100 wpisów. Interfejs przekazuje je dopiero po `E_MISSING_COLUMNS`, żeby stary wybór nie nadpisał rozpoznanych kolumn.
35. Anonimizacja prawdziwych eksportów (`scripts/anonymize-exports.ts`): zostają wyłącznie kolumny daty, liczb i typu z wartościami o kształcie pola; pliki `real-*.csv` nazywamy według formatu (język, separator, kodowanie, miesiące), nie nazwy pliku źródłowego. Skrypt kończy się kodem 1, gdy któregoś pliku nie da się zanonimizować albo kopia nie parsuje się bez mapowania ręcznego (warunek startu).
36. Plik testu prywatności ma znacznik `SEDNO-PRIVACY-CANARY-7f3a` w pierwszej linii, w każdym opisie i w nazwie konta, ale nie w permalinkach (te mogą trafić na serwer wśród najlepszych publikacji).

### Obliczenia (`lib/report/compute.ts`)

37. Kolumna bez ani jednej wartości w miesiącu M daje brak danych (`null`, w raporcie „—”), nie 0; pusta komórka obok wypełnionych liczy się jako 0. _Do potwierdzenia na prawdziwych eksportach_: jeśli Meta zostawia pustą komórkę zamiast 0, miesiąc bez nowych obserwujących pokaże „—”.
38. Liczby z pliku i efekty wpisane ręcznie czyścimy tak samo: ujemne, NaN, nieskończone albo większe niż 1 000 000 000 to brak danych; ułamki zaokrąglamy.
39. Poprzedni miesiąc wybieramy osobno dla podsumowania (plik → zapisany raport → pola ręczne) i dla efektów (zapisany raport → pola ręczne), całymi grupami; `previous.source` to źródło podsumowania, a gdy go nie ma — efektów. W `previous.summary` tylko liczby do porównań (posts, views, interactions, follows), bez `byType` i `topPosts` (minimalizacja danych).
40. **Plik obejmuje M−1 tylko wtedy, gdy ma z niego publikacje i pierwsza z nich wypada w pierwszych 7 dniach M−1.** Eksport „ostatnie 60 dni” (np. od 13 sierpnia) zaniżyłby porównanie, więc takiego M−1 z pliku nie porównujemy, a edytor prosi o liczby ręczne (`previousFileCoverage: 'partial'`). _Pytanie do właściciela_: czy próg 7 dni jest dobry.
41. **Zakres danych raportu zaczyna się 1. dnia miesiąca, chyba że pierwsza publikacja w pliku wypada po 7. dniu** — wtedy od dnia pierwszej publikacji. Kończy się ostatnią publikacją, końcem miesiąca albo chwilą obecną (co wcześniej). Liczba dni w `W_INCOMPLETE_MONTH` i w przypisie to dni tego zakresu, więc przypis zgadza się z zakresem w źródle danych.
42. **Emoji usuwamy z tekstów autora i nazw** (tytuł, komentarz, plan, zakreślenie, klient, autor): kroje marki ich nie mają i w PDF byłyby pustymi prostokątami; podgląd i PDF wyglądają tak samo. Edytor o tym informuje.
43. Bez wyświetleń w M lista najlepszych publikacji jest pusta (zasięgu nie podstawiamy). Kluczowa liczba wskazująca efekt bez wartości ustępuje domyślnej; efekt równy 0 daje tytuł „W tym miesiącu nikt nie kliknął »…«”; brak wartości kluczowej daje „Raport za {miesiąc}”.
44. `W_METRIC_CHANGE` i przypis: gdy M ≤ 2025-04 albo gdy istnieje porównanie z dowolnego źródła, a M−1 ≤ 2025-04. Długości tekstów ogranicza edytor; `computeReport` niczego nie przycina.

### Raport HTML i PDF

45. Porównanie: „{M−1}: {liczba}” (także 0) albo „Brak danych z {M−1 w dopełniaczu}”. Zmiana m/m tylko przy wyświetleniach i tylko raz (przy kluczowej liczbie, gdy to wyświetlenia, inaczej przy słupku). Słupki względem większej liczby z pary.
46. Tytuł raportu jest także w PDF i w szerokim widoku HTML (§11 p. 2), choć arkusz A4 w makiecie go pomija. Sekcja komentarza to „Co zadziałało” (także na telefonie).
47. Raport HTML ma jeden markup i dwa układy przez zapytania kontenera: poniżej 560 px wygląd telefonu, powyżej arkusz A4.
48. PDF: Bricolage 650 z marki to statyczny SemiBold 600, liczby w tekście w Medium 500; zakreślacz to żółte tło pod całą wysokością wiersza (bez paska 58–92%); pętla to ta sama ścieżka z marki przeskalowana do pola liczby (bez `vector-effect`).
49. **PDF mieści się na jednej stronie A4** także z przypisami o metrykach i niepełnym miesiącu: odstęp między blokami 18 pt zamiast 22 pt z makiety, tekst 14/20; gdy kluczowe są wyświetlenia, trzy efekty stoją w zwartych wierszach (etykieta i liczba w jednej linii). Test pilnuje jednej strony dla obu wariantów.
50. **PDF nie jest tagowany** (`@react-pdf/renderer` tego nie umie) — dostępną wersją raportu jest link HTML (Faza 2).
51. Przed pierwszym PDF w karcie `preparePdfFonts()` wczytuje glify ASCII i polskiego alfabetu (obejście błędu fontkit, przez który kolejne PDF traciły mapowanie tekstu); po nieudanym pobraniu fontu ponowna próba działa bez przeładowania strony.
52. Nazwa pliku PDF: `raport-{slug klienta}-{yyyy-mm}.pdf`. Bez nazwy autora raport nie pokazuje awatara i zaczyna się od „dla: {klient}”. Logo autora w PDF dojdzie z kontami.

### Zdarzenia i lista oczekujących

53. Magazyn: Supabase z kluczem serwisowym, gdy ustawione są `NEXT_PUBLIC_SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY`; inaczej plikowy `FileStore` w `SEDNO_DEV_STORE_DIR` (tylko rozwój i e2e). Bez magazynu formularza listy nie pokazujemy (`waitlistEnabled()`), a zdarzenia są pomijane. Zapytania do Supabase mają limit 8 s.
54. Migracja `waitlist`/`events`: RLS bez polityk, odebrane uprawnienia ról `anon` i `authenticated`; odczyt dla admina dojdzie z auth w Fazie 2.
55. Limity w pamięci procesu (osobna pula na każdą przestrzeń kluczy): zdarzenia 120/min na IP i 120/min na sesję; lista 5 zapisów na 10 min na IP (liczone po walidacji). Klucz to IP bez portu, IPv6 skrócony do /64. IP nie jest zapisywane ani logowane.
56. `waitlist_joined`, `signup_completed`, `purchase_completed` zapisuje wyłącznie serwer; przeglądarka (`track()`) nie może ich wysłać. Identyfikator sesji: dokładnie 22 znaki base64url (16 bajtów z CSPRNG) w `sessionStorage`.
57. **`waitlist_joined` zapisujemy bez identyfikatora sesji**, żeby anonimowych zdarzeń sesji (np. wczytanie pliku) nie dało się powiązać z adresem e-mail przez zbliżony czas zapisu.
58. Ponowny zapis tej samej pary (e-mail, plan) daje ten sam komunikat sukcesu (nie zdradzamy, kto jest na liście); zdarzenie tylko przy nowym wpisie. `zod` ładuje się dynamicznie w `track()`, więc nie trafia do JavaScriptu strony głównej. Adres e-mail musi być w ASCII (komunikat mówi to wprost).

### Wydajność, CSP i testy

59. **Budżet JS strony głównej (§15: < 80 KB gzip) nie jest spełniony i w tym stosie nie da się go spełnić bez zmiany architektury.** Pomiar po `next build` (gzip -9, skrypty z HTML, bez `nomodule` i prefetchu): razem 143,4 KB, z czego 135,6 KB to sam runtime React 19 + Next.js 16 App Router (strona 404 bez naszych komponentów klienckich) i 7,9 KB nasz kod (formularz listy oczekujących). Strona jest statyczna, a JS nie blokuje renderu: LCP na telefonie przy spowolnieniu (≈ wolne 4G, CPU ×4) to ok. 0,8 s. Test e2e pilnuje twardo naszego kodu (< 20 KB ponad bazę frameworka) i zapisuje całość w adnotacji. _Decyzja właściciela_: (a) przyjąć budżet „nasz kod < 20 KB” przy LCP < 2,5 s; (b) przenieść `/` do Pages Router z `unstable_runtimeJS: false` (0 KB JS, API niestabilne, formularz listy jako zwykły POST do route handlera); (c) inny generator dla strony głównej.
60. **Zod działa w trybie `jitless`** (`lib/zod.ts`, jedyne dozwolone źródło importu — reguła ESLint). Zod 4 przy pierwszej walidacji obiektu sprawdza `Function("")`, a CSP bez `'unsafe-eval'` zgłasza to jako naruszenie na /nowy. Walidacja bez kompilacji jest wolniejsza, ale dane są małe.
61. **Test prywatności nagrywa ruch przez własne proxy HTTP** (`tests/e2e/recording-proxy.ts`, przeglądarka bez wyjątku dla localhost), bo Playwright 1.56 nie pokazuje żądań z dedykowanych Web Workerów w zdarzeniach `request` ani w `route()`. Proxy odrzuca tunele (CONNECT), więc ruch poza aplikację kończy test błędem; kontrola pozytywna wysyła znacznik ze strony i z workera (z bezwzględnym adresem, bo worker z `blob:` nie ma adresu bazowego).

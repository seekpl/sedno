# Sedno — prompt startowy dla Claude Code

> **Jak użyć (dla właściciela projektu):**
> 1. Utwórz pusty katalog projektu.
> 2. Skopiuj do niego ten plik jako `PROMPT.md` oraz paczkę `sedno-brand-kit.zip`.
> 3. Uruchom Claude Code w tym katalogu i napisz: **„Przeczytaj PROMPT.md i zacznij od sekcji 0.”**
>
> Claude Code będzie pracował fazami i po każdej fazie zatrzyma się z raportem i zrzutami ekranu.

---

## 0. Twoje zadanie i sposób pracy

Jesteś głównym inżynierem i projektantem produktu, który buduje od zera aplikację webową **Sedno**. To polskie narzędzie dla SMM-owców, które z eksportu Meta Business Suite i trzech liczb z panelu profesjonalnego Instagrama robi miesięczny raport dla właściciela lokalnej firmy.

Wygląd, ton i teksty są już zaprojektowane. Znajdziesz je w paczce `sedno-brand-kit.zip`. Twoim zadaniem jest wierne wdrożenie tego projektu, a nie wymyślanie nowego.

**Zacznij tak:**

1. Rozpakuj paczkę: `unzip sedno-brand-kit.zip -d brand` (wynik: `./brand/README.md`, `./brand/tokens.json` itd.). Nie edytuj plików w `./brand`. To źródło prawdy, tylko do odczytu.
2. Przeczytaj w całości: `brand/README.md`, `brand/docs/0-zasady-marki.md`, `brand/docs/4-komunikacja.md`, `brand/docs/5-ekrany.md`, `brand/docs/6-przekazanie.md`. Otwórz w przeglądarce (Playwright) i obejrzyj `brand/reference/screens/*.html` oraz `brand/reference/components/*.html`.
3. Utwórz `CLAUDE.md` z sekcjami 2, 13, 14, 15 i 20 tego dokumentu w skrócie (zasady, które obowiązują w każdej sesji).
4. Wejdź w tryb planowania. Przedstaw plan **Fazy 0 i 1** (sekcja 18): pliki, kolejność, ryzyka, pytania. Potem implementuj.
5. Po każdej fazie zatrzymaj się. Pokaż listę zrobionych rzeczy z kryteriami akceptacji (spełnione / niespełnione), zrzuty kluczowych ekranów na 390 px i 1280 px obok odpowiednich stron z `brand/reference/` oraz otwarte pytania. Zrób commit z opisem fazy.

**Zasady pracy:**
- Kiedy czegoś nie wiesz, przyjmij najprostsze rozsądne założenie, zapisz je w `docs/decisions.md` i pracuj dalej. Blokuj się tylko na decyzjach nieodwracalnych (płatności produkcyjne, usuwanie danych).
- Nie dodawaj funkcji spoza zakresu (sekcja 3), nawet jeśli są łatwe.
- Każda funkcja ma test. Każda obietnica w interfejsie (np. „plik zostaje w przeglądarce”) ma test, który ją sprawdza.
- Zanim uznasz ekran za skończony, porównaj zrzut z makietą z `brand/reference/` i popraw rozbieżności.

---

## 1. Produkt w skrócie

**Problem.**
- Polscy SMM-owcy i freelancerzy prowadzą Instagram kilku lokalnym firmom: salonom beauty, restauracjom, gabinetom. Co miesiąc ręcznie składają raport ze zrzutów ekranu i arkusza.
- Właściciel firmy nie rozumie zasięgów. Liczy telefony, dojazdy i rezerwacje. Klient, który nie widzi efektów, nie przedłuża współpracy.

**Rozwiązanie.**
- SMM-owiec wgrywa plik CSV z Meta Business Suite i dopisuje trzy liczby: kliknięcia „Zarezerwuj”, „Zadzwoń” i „Wyznacz trasę”.
- Sedno tworzy jednostronicowy raport po polsku. Na górze jest jedna zakreślona kluczowa liczba, pod nią komentarz SMM-owca i zasięgi.
- Raport trafia do klienta jako link albo PDF.

**Kto płaci, a kto czyta.** Płaci i obsługuje SMM-owiec (komputer i telefon). Czyta właściciel firmy (głównie telefon, czasem wydruk). W raporcie marka SMM-owca stoi przed marką Sedno.

**Obietnica marki:** „Raport, który klient rozumie.”

**Czego Sedno nie robi:**
- nie łączy się z kontami klientów;
- nie korzysta z API Mety;
- nie publikuje postów;
- nie jest narzędziem Mety.

---

## 2. Niezmienne zasady (wpisz je do CLAUDE.md)

1. **Plik CSV nigdy nie opuszcza przeglądarki.**
   - Parsowanie odbywa się po stronie klienta (Web Worker).
   - Na serwer trafia wyłącznie zagregowana treść raportu: liczby z podsumowania, komentarz, trzy liczby efektów i krótka lista najlepszych publikacji (data, typ, wyświetlenia, interakcje).
   - Nigdy nie wysyłamy ani nie zapisujemy opisów postów, surowych wierszy ani samego pliku. To sprawdza test e2e (sekcja 17).
2. **Bez konta wszystko dzieje się w przeglądarce.** Użytkownik bez konta może zrobić raport i pobrać PDF. Link, historia i logo wymagają konta.
3. **Raport dla klienta jest zawsze jasny** (`data-theme="light"`), na każdym urządzeniu i w każdym motywie.
4. **Żadnych integracji z Meta/Instagram API**, scrapingu ani logowania przez Instagram. Bez logo i gradientu Instagrama. Bez „Insta” i „Gram” w nazwach. Nazwy Instagram i Meta Business Suite występują tylko opisowo.
5. **Nie pokazuj jako dostępnej funkcji, której nie ma.** Plan Studio i kalkulator wyceny to „Wkrótce”. Darmowy szablon pokazuj jako dostępny tylko wtedy, gdy ustawiono jego URL (flaga, sekcja 12).
6. **Bez zmyślonych danych marketingowych:** żadnych opinii klientów, liczników użytkowników, logotypów firm, „100%”, „AI”, „w 5 minut”. Przykłady na stronie są oznaczone jako przykładowe.
7. **Wygląd wyłącznie z `brand/`.**
   - Nie dodawaj Tailwinda, shadcn, MUI ani innego zestawu UI.
   - Nie wprowadzaj nowych kolorów, cieni ani promieni spoza tokenów.
   - Komponenty React tylko nakładają klasy `sd-*` z `brand/components.css`.
8. **Polski język i polska typografia:** cudzysłowy „ ” i » «, `Intl` z `pl-PL`, poprawna odmiana liczebników (sekcja 14). Kwoty, liczby i daty składaj w Bricolage z cyframi tabelarycznymi (klasa `sd-num`).

---

## 3. Zakres

**MVP (budujesz):**
- strona marketingowa;
- narzędzie bez konta (CSV → efekty → podgląd → PDF);
- konto przez magic link;
- klienci, raporty miesięczne i edytor;
- link publiczny do raportu;
- historia i porównanie z poprzednim miesiącem;
- logo SMM-owca na raporcie;
- plan darmowy i Solo, pojedynczy zakup raportu;
- lista oczekujących na plan Studio;
- poradniki w MDX (infrastruktura + jeden szkic);
- metryki testu popytu;
- strony prawne z miejscami do uzupełnienia.

**Później (nie budujesz, najwyżej zostaw miejsce w modelu danych):**
- plan Studio: własny kolor marki w raporcie, zespół, do 25 klientów;
- kalkulator wyceny;
- Google Business Profile;
- skrzynka materiałów od klienta;
- generowanie komentarza przez AI;
- ciemny motyw aplikacji (tokeny są gotowe, ale nie dodawaj przełącznika);
- integracja z systemem faktur KSeF.

**Nigdy:** API Mety, publikowanie i planowanie postów, skrzynka wiadomości, dashboardy analityczne, scraping profili.

---

## 4. Stack i decyzje techniczne

| Obszar | Wybór | Dlaczego |
|---|---|---|
| Framework | Next.js (aktualna stabilna, App Router), TypeScript `strict`, pnpm | Strona marketingowa statyczna, aplikacja i API w jednym repozytorium |
| Style | Globalnie `brand/tokens.css` + `brand/components.css`, układ stron w CSS Modules | Jedno źródło wyglądu, zero rozjazdu z projektem |
| Baza, auth, pliki | Supabase: Postgres (region UE), Auth (magic link e-mail), Storage (logo SMM-owców), RLS | Mało kodu backendu, dane w UE |
| CSV | PapaParse w Web Workerze + `zod` | Parsowanie dużych plików bez blokowania UI, wyłącznie po stronie klienta |
| PDF | `@react-pdf/renderer` w przeglądarce (import dynamiczny), fonty TTF z `brand/fonts/pdf/` | PDF powstaje bez serwera, także bez konta |
| Płatności | Stripe Checkout (subskrypcja + płatność jednorazowa), Customer Portal, webhooki. Metody: karta i BLIK (Przelewy24 opcjonalnie, jeśli dostępne na koncie) | Standard, polskie metody płatności |
| Hosting | Vercel (region `fra1`) albo inny host Next.js. Konfiguracja przez zmienne środowiskowe | Szybki start; nic nie wiąże z jednym dostawcą |
| Analityka | Własna tabela `events`, bez cookies i skryptów zewnętrznych | RODO bez banera; dane do testu popytu |
| Testy | Vitest (logika), Playwright (e2e, zrzuty, test prywatności), `@axe-core/playwright` | Sekcja 17 |
| Jakość | ESLint, Prettier, `tsc --noEmit`, GitHub Actions: lint, typecheck, test, build | — |

Zmienne środowiskowe opisz w `.env.example`:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`;
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_SOLO_MONTHLY`, `STRIPE_PRICE_SINGLE_REPORT`;
- `NEXT_PUBLIC_SITE_URL`;
- `NEXT_PUBLIC_TEMPLATE_URL` (pusty = szablon „Wkrótce”);
- `ADMIN_EMAILS`.

Ceny wyświetlane w interfejsie bierz z jednego pliku konfiguracyjnego `config/pricing.ts` (netto, VAT 23%, waluta PLN), nigdy z tekstu wpisanego na sztywno.

---

## 5. Architektura i przepływ danych

```
[przeglądarka]
  plik CSV ──► Web Worker: dekodowanie, wykrycie nagłówka, mapowanie kolumn, parsowanie
           ──► ParsedExport (wiersze w pamięci, nigdy wysyłane)
           ──► computeReport(month) ──► ReportData (zagregowane liczby)
  + trzy liczby efektów + komentarz ──► <Report data> (HTML) i <ReportPdf data> (PDF)

  bez konta: koniec. PDF pobierany lokalnie, nic nie trafia na serwer poza zdarzeniami analitycznymi bez treści.

  z kontem: ReportData ──► Server Action ──► Supabase `reports` (RLS: owner)
                              └─► `share_links` (token) ──► /r/[token] (render serwerowy, zawsze jasny)
```

- `ReportData` to jedyny format raportu. Ten sam obiekt renderuje podgląd, stronę `/r/[token]` i PDF.
- Najlepsze publikacje zapisujesz bez opisów: `{ publishedAt, type, views, interactions, permalink? }`.

---

## 6. Import CSV (Meta Business Suite, eksport treści)

**Uwaga:** dokładny format eksportu nie jest potwierdzony. Kolumny, kodowanie i separator mogą różnić się zależnie od języka interfejsu, urządzenia i daty. Zbuduj parser odporny na różnice, a potem dopnij go do prawdziwych plików od właściciela (pytanie 1 w sekcji 19).

**Dekodowanie:**
- Wykryj BOM. Domyślnie UTF-8. Jeśli w tekście pojawi się znak zastępczy `�`, spróbuj `windows-1250` (plik zapisany ponownie w polskim Excelu).
- Separator wykrywaj automatycznie: `,`, `;` lub tabulator.
- Nagłówek to pierwszy wiersz zawierający co najmniej 3 znane pola (eksporty bywają poprzedzone wierszami opisu).

**Normalizacja nagłówków:** małe litery, usunięcie polskich znaków diakrytycznych, przycięcie, zwinięcie spacji, usunięcie cudzysłowów.

**Mapa synonimów** w `lib/csv/columns.ts`. To hipotezy do potwierdzenia:

| Pole | Synonimy (po normalizacji) | Wymagane |
|---|---|---|
| `publishedAt` | publish time, czas publikacji, data publikacji, date, data | tak |
| `views` | views, wyswietlenia | tak (albo `reach`) |
| `reach` | reach, zasieg, accounts reached, konta, do ktorych dotarto | nie |
| `likes` | likes, polubienia, reakcje | nie |
| `comments` | comments, komentarze | nie |
| `shares` | shares, udostepnienia | nie |
| `saves` | saves, zapisania | nie |
| `follows` | follows, obserwacje, nowi obserwujacy | nie |
| `type` | post type, typ posta, typ, content type | nie |
| `permalink` | permalink, link | nie |
| `description` | description, opis | **czytaj tylko po to, żeby go pominąć; nigdy nie przenoś dalej** |

**Wartości:**
- Liczby: usuń spacje i NBSP. „1 234”, „1,234” i „1.234” to tysiące, gdy po separatorze są dokładnie 3 cyfry i brak drugiej części dziesiętnej. Pusta komórka to `null`, a nie 0.
- Daty: ISO, `MM/DD/YYYY HH:mm`, `DD.MM.YYYY HH:mm`. Niejednoznaczny format rozstrzygnij po wartościach (> 12 w pierwszym polu oznacza dzień). Strefa czasowa `Europe/Warsaw`.

**Mapowanie ręczne:** gdy brakuje pól wymaganych, pokaż ekran „Przypisz kolumny” z listą nagłówków z pliku i selectem dla każdego wymaganego pola. Wybór zapamiętuj w `localStorage` jako mapę `nagłówek → pole`.

**Limity:** 10 MB i 20 000 wierszy. Plik bez rozszerzenia `.csv` lub z MIME innym niż tekstowy odrzuć z komunikatem.

**Wynik:**
```ts
type PostRow = { publishedAt: Date; type: 'reel'|'post'|'carousel'|'story'|'other'; views: number|null; reach: number|null;
  likes: number|null; comments: number|null; shares: number|null; saves: number|null; follows: number|null; permalink?: string };
type ParsedExport = { rows: PostRow[]; range: { from: Date; to: Date }; months: string[] /* 'YYYY-MM' */; warnings: Warning[] };
```

**Fixtures** w `tests/fixtures/`:
- Na start syntetyczne, wyraźnie nazwane `synthetic-*.csv`: PL i EN nagłówki, średnik, BOM, windows-1250, wiersze opisu nad nagłówkiem, puste komórki, dwa miesiące w jednym pliku, niepełny miesiąc, brak kolumny „Wyświetlenia”.
- Po otrzymaniu prawdziwych eksportów dodaj je zanonimizowane (bez opisów i linków) jako `real-*.csv`.

**Kody błędów i ostrzeżeń** (teksty w sekcji 14): `E_NOT_CSV`, `E_EMPTY`, `E_TOO_BIG`, `E_MISSING_COLUMNS`, `E_NO_ROWS_IN_MONTH`, `W_ENCODING_GUESSED`, `W_INCOMPLETE_MONTH`, `W_MONTH_IN_PROGRESS`, `W_METRIC_CHANGE`.

---

## 7. Obliczenia raportu (`lib/report/compute.ts`, czyste funkcje + testy)

**Liczby z pliku dla miesiąca M (publikacje z datą w M):**
- `posts`: liczba publikacji, z podziałem na typy;
- `views`: suma wyświetleń;
- `interactions`: suma polubień, komentarzy, udostępnień i zapisań (brakujące pola pomijaj);
- `follows`: suma, jeśli kolumna istnieje;
- `topPosts`: 3 publikacje o największej liczbie wyświetleń.

**Nie sumuj zasięgu z publikacji i nie nazywaj takiej sumy „zasięgiem konta”.** Zasięg to unikalne konta, więc suma po postach go zawyża. W raporcie pokazujemy „Wyświetlenia”, a nie zasięg.

**Poprzedni miesiąc (M−1), w tej kolejności:**
1. z tego samego pliku, jeśli obejmuje M−1;
2. z zapisanego raportu tego klienta za M−1 (konto Solo);
3. z pól ręcznych (opcjonalnych);
4. w przeciwnym razie porównań nie ma, a raport pisze „Brak danych z {miesiąca M−1}”.

Zapisz źródło (`file` | `history` | `manual`).

**Efekty** (wpisywane ręcznie): `book`, `call`, `directions` (liczby całkowite ≥ 0 lub `null`), plus te same za M−1 (podpowiadane ze źródła powyżej).

**Kluczowa liczba:** domyślnie efekt o największej wartości. Użytkownik może zmienić wybór. Jeśli wszystkie trzy są równe 0 lub `null`, kluczową liczbą zostają wyświetlenia, a edytor pokazuje podpowiedź.

**Tytuł raportu** generuj z szablonu, bez AI. Użytkownik może go nadpisać:
- `book`: „{n} {osoba/osoby/osób} {chciała/chciały/chciało} się umówić”
- `call`: „{n} {osoba zadzwoniła/osoby zadzwoniły/osób zadzwoniło}”
- `directions`: „{n} {osoba sprawdziła/osoby sprawdziły/osób sprawdziło} dojazd”
- `0`: „W tym miesiącu nikt nie kliknął »{przycisk}«” (przycisk w mianowniku: „Zarezerwuj” / „Zadzwoń” / „Wyznacz trasę”)

**Porównania:**
- Zawsze pokazuj liczbę z poprzedniego miesiąca słowami („sierpień: 17”).
- Procent pokazuj tylko przy wyświetleniach, gdy M−1 ≥ 1000 i |zmiana| ≥ 1%: „+9% m/m”, „−4% m/m” (prawdziwy minus U+2212).
- Spadek nie ma czerwonego koloru ani strzałek.

**Ostrzeżenia:**
- `W_INCOMPLETE_MONTH`: miesiąc minął, a ostatnia data w pliku jest wcześniejsza niż jego koniec. Podaj liczbę dni.
- `W_MONTH_IN_PROGRESS`: miesiąc jeszcze trwa.
- `W_METRIC_CHANGE`: porównanie obejmuje miesiąc kwiecień 2025 lub wcześniejszy. W kwietniu 2025 r. Meta zastąpiła metrykę Impressions metryką Views, więc raport dodaje przypis.

**Sugestia „Co zrobiliśmy”:** z liczby publikacji wg typu, np. „8 rolek, 6 postów, 14 relacji”. Wstaw ją jako podpowiedź w polu, nie jako gotowy tekst.

**Typ wynikowy (zapisywany w bazie, jeden dla HTML i PDF):**
```ts
type ReportData = {
  period: string; // 'YYYY-MM'
  client: { name: string };
  author: { name: string; logoUrl?: string };          // marka SMM-owca
  branding: 'sedno-footer' | 'author';                   // wg uprawnień
  summary: { posts: number; byType: Record<string, number>; views: number|null; interactions: number|null; follows: number|null;
             topPosts: { publishedAt: string; type: string; views: number|null; interactions: number|null; permalink?: string }[] };
  actions: { book: number|null; call: number|null; directions: number|null };
  previous?: { source: 'file'|'history'|'manual'; summary?: Partial<ReportData['summary']>; actions?: Partial<ReportData['actions']> };
  keyMetric: 'book'|'call'|'directions'|'views';
  headline: string; commentWorked?: string; planNext?: string;
  dataRange: { from: string; to: string }; flags: { incompleteDays?: number; metricChangeNote?: boolean; inProgress?: boolean };
};
```

---

## 8. Model danych (Supabase, migracje w `supabase/migrations`)

```sql
create type plan_t as enum ('free','solo');
create type industry_t as enum ('salon','restauracja','gabinet','sklep','inne');
create type report_status_t as enum ('draft','ready','sent');
create type key_metric_t as enum ('book','call','directions','views');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  brand_name text check (char_length(brand_name) <= 80),
  logo_path text,
  plan plan_t not null default 'free',
  plan_renews_at timestamptz,
  stripe_customer_id text unique,
  created_at timestamptz not null default now()
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  industry industry_t not null default 'inne',
  included_in_free boolean not null default false,   -- pierwszy klient w planie darmowym
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  period date not null check (extract(day from period) = 1),
  status report_status_t not null default 'draft',
  data jsonb not null,                 -- ReportData (bez surowych wierszy i opisów)
  unlocked boolean not null default false,   -- kupiony pojedynczo
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, period)
);

create table share_links (
  token text primary key,              -- 22 znaki base62 z crypto.getRandomValues / randomBytes
  report_id uuid not null references reports(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,     -- domyślnie +12 miesięcy
  revoked_at timestamptz,
  views integer not null default 0
);

create table subscriptions (
  owner_id uuid primary key references profiles(id) on delete cascade,
  stripe_subscription_id text unique, status text not null, current_period_end timestamptz
);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  report_id uuid references reports(id) on delete set null,
  stripe_checkout_session_id text unique not null, amount_gross integer not null, currency text not null default 'pln',
  status text not null, created_at timestamptz not null default now()
);

create table waitlist (
  id uuid primary key default gen_random_uuid(), email text not null, plan text not null default 'studio',
  consent_at timestamptz not null, created_at timestamptz not null default now(), unique (email, plan)
);

create table events (
  id bigserial primary key, name text not null, anon_id text, owner_id uuid,
  props jsonb not null default '{}', created_at timestamptz not null default now()
);
```

**RLS:**
- Włączone na wszystkich tabelach.
- `profiles`, `clients`, `reports`, `subscriptions`, `purchases`: dostęp tylko gdy `owner_id = auth.uid()` (dla `profiles`: `id = auth.uid()`).
- `share_links`: dostęp przez własność raportu.
- `waitlist` i `events`: tylko wstawianie przez Server Action z kluczem serwisowym. Odczyt tylko admin (`ADMIN_EMAILS`).

**Publiczny odczyt raportu:** funkcja `get_shared_report(token text)` typu `security definer`. Zwraca `data` i `branding` tylko dla linku nieodwołanego i nieprzeterminowanego, zwiększa `views` i nie zwraca żadnych identyfikatorów.

**Storage:** bucket `logos` (prywatny, ścieżka `{owner_id}/logo.{png|jpg|webp}`), max 2 MB, bez SVG (ryzyko XSS). Na raporcie publicznym podawaj podpisany URL.

**Usunięcie konta** usuwa kaskadowo wszystkie dane i plik logo. **Eksport danych:** JSON wszystkich raportów (Ustawienia).

---

## 9. Plany, uprawnienia i płatności

Jedna funkcja `lib/entitlements.ts` decyduje o wszystkim i ma testy dla każdej kombinacji:

| | Bez konta | Na start (0 zł) | Solo (49 zł netto/mies.) | Raport kupiony pojedynczo (9 zł netto) |
|---|---|---|---|---|
| Raport i PDF | tak, stopka „Przygotowano w Sedno” | tak dla klienta `included_in_free`, ze stopką | tak, do 10 aktywnych klientów | tak, ten jeden raport |
| Link do raportu | nie | tak (klient `included_in_free`) | tak | tak |
| Logo SMM-owca, brak stopki | nie | nie | tak | tak |
| Porównanie z historią | nie | nie (plik lub ręcznie) | tak | — |
| Kolejni klienci | — | można dodać; eksport ich raportów wymaga zakupu pojedynczego albo Solo | do 10; powyżej: komunikat o Studio + lista oczekujących | — |

**Raport zablokowany** (klient poza limitem): edytor i podgląd działają. Przyciski „Pobierz PDF” i „Utwórz link” mają `aria-disabled` i otwierają panel z dwiema opcjami: „Kup ten raport za 9 zł netto” i „Przejdź na Solo”. Ceny bierz z `config/pricing.ts`.

**Stripe:**
- Checkout w trybie `subscription` (Solo) i `payment` (pojedynczy raport, `metadata.report_id`).
- `tax_id_collection` włączone, żeby firma mogła podać NIP. Customer Portal do zmiany karty i rezygnacji.
- Webhook (`checkout.session.completed`, `customer.subscription.updated|deleted`, `invoice.payment_failed`) aktualizuje `subscriptions`, `profiles.plan` i `purchases`/`reports.unlocked`.
- Webhook jest idempotentny i weryfikuje podpis. Testuj w trybie testowym Stripe CLI.

**Faktury:**
- Od 1 kwietnia 2026 r. polscy przedsiębiorcy wystawiają faktury w KSeF; najmniejsi (do 10 000 zł sprzedaży miesięcznie) od 1 stycznia 2027 r. **Nie generuj faktur samodzielnie.**
- W MVP: potwierdzenie płatności ze Stripe i notatka w `docs/decisions.md`, że faktury wystawia właściciel w swoim systemie fakturowym zgodnym z KSeF.
- Integracja z takim systemem to zadanie na później, po decyzji właściciela i księgowej.

---

## 10. Ekrany i trasy

Wzorce wyglądu są w `brand/reference/screens/`. Wszystkie ekrany są mobile-first. Wzorce dla kontrolek i stanów są w `brand/reference/components/`.

| Trasa | Ekran | Wzorzec |
|---|---|---|
| `/` | Strona główna | `EkranLanding.html`, `EkranLandingMobile.html` |
| `/przyklad` | Przykładowy raport (dane przykładowe, oznaczone) | `EkranRaport.html` |
| `/szablon` | Darmowy szablon (flaga `NEXT_PUBLIC_TEMPLATE_URL`) | sekcja „Darmowe narzędzia” |
| `/poradniki/[slug]` | Poradniki MDX | typografia z tokenów |
| `/prywatnosc`, `/regulamin`, `/kontakt` | Strony prawne z `[DO UZUPEŁNIENIA]` | — |
| `/nowy` | Narzędzie bez konta: 1. Wgraj → 2. Efekty → 3. Podgląd i PDF | `EkranWgrywanie.html`, `EkranUzupelnij.html` |
| `/logowanie` | Magic link (e-mail → „Sprawdź skrzynkę”) | `TextField`, `Button` |
| `/app/klienci?m=YYYY-MM` | Panel klientów na miesiąc | `EkranPanel.html` |
| `/app/klienci/[id]/[yyyy-mm]` | Edytor raportu (kroki 1–3, podgląd na żywo od 1024 px) | `EkranUzupelnij.html` |
| `/app/raporty` | Historia raportów (paginacja po 20) | `Pagination` |
| `/app/ustawienia` | Profil i marka (nazwa, logo), Plan i płatności, Eksport i usunięcie danych | `EkranCennik.html` |
| `/r/[token]` | Raport publiczny, zawsze jasny, `noindex`, przycisk „Pobierz PDF” | `EkranRaport.html` |
| `/app/admin/metryki` | Lejek testu popytu (tylko `ADMIN_EMAILS`) | `DataTable` |

**Szczegóły, których nie wolno pominąć:**
- **Przełącznik miesiąca** (`sd-month`) jest w pasku aplikacji. Domyślny miesiąc to ostatni pełny miesiąc.
- **Wgrywanie:**
  - przeciąganie pliku (`sd-upload--over`) i przycisk „Wybierz plik” (na telefonie tylko przycisk);
  - zawsze widoczna linia prywatności;
  - po wczytaniu chip pliku i alert „Wczytano {n} publikacji z {miesiąca w dopełniaczu}”;
  - link „Jak zrobić eksport?” prowadzi do poradnika.
- **Efekty:**
  - trzy pola liczbowe (`inputmode="numeric"`, wysokość 48 px na telefonie);
  - pod każdym wartość z poprzedniego miesiąca, jeśli jest;
  - wybór kluczowej liczby (plakietki z ikoną `circle-mark`);
  - dwa pola komentarza: „Co zadziałało” i „Plan na {następny miesiąc}”.
- **Panel:**
  - postęp „{x} z {y} raportów wysłane”;
  - tabela od 768 px, poniżej karty;
  - brak danych to „—”, nie 0;
  - toast z „Cofnij” po wysłaniu.
- **Stany:**
  - pusty: `EmptyState`;
  - ładowanie: `Skeleton` i licznik „Czytam plik: {n} z {m} publikacji”;
  - błąd: `Alert` error z naprawą;
  - sukces: `Alert` success z działaniami i `Toast`;
  - niepełne dane: `Alert` warning;
  - niedostępny przycisk: `aria-disabled` i wyjaśnienie.
- **Status raportu** jako plakietka: Szkic, Gotowy, Wysłany, Brak eksportu, Błąd pliku. Zawsze z ikoną i słowem (tabela w `brand/reference/components/Badge.html`).

---

## 11. Raport dla klienta (HTML i PDF)

**Wspólny układ:**
1. marka autora (logo lub nazwa) + „dla: {klient}” + miesiąc i zakres dat;
2. tytuł z sekcji 7;
3. kluczowa liczba w `number-hero` z **zakreśleniem** (`sd-circled`, ścieżka SVG z `brand/reference/components/Circled.html`) i „{miesiąc M−1}: {wartość}”;
4. dwie pozostałe liczby efektów (`sd-metric`);
5. komentarz z jednym zdaniem w zakreślaczu (`sd-mark`). Autor zaznacza fragment w edytorze, a domyślnie zakreślacza nie ma;
6. sekcja „Zasięg”: słupki wyświetleń M i M−1 (`report-pen`, `report-previous`), nowi obserwujący, jeśli są;
7. „Plan na {miesiąc}”;
8. przypis źródła: „Dane: eksport Meta Business Suite i panel profesjonalny Instagrama, {zakres}.” + przypis o zmianie metryk, jeśli `metricChangeNote`;
9. stopka „Przygotowano w [logo Sedno]”, gdy `branding = 'sedno-footer'`.

**Zasady:**
- **Tylko jedno zakreślenie** na raport.
- Raport nie zwraca się do czytelnika formą „Ty” ani „Pan/Pani”. Pisze bezosobowo.

**HTML (`/r/[token]`, podgląd w edytorze):**
- komponent `<Report data>` w kontenerze `sd-report` + `data-theme="light"`, maksymalna szerokość `--report-sheet`;
- strona `/r/[token]` ma `<meta name="robots" content="noindex,nofollow">` i `Referrer-Policy: no-referrer`;
- tytuł strony „Raport za {miesiąc} — {klient}”;
- OG ogólne, bez liczb;
- wygasły lub odwołany link pokazuje: „Ten raport nie jest już dostępny. Poproś osobę, która go wysłała, o nowy link.”

**PDF (`<ReportPdf data>`, @react-pdf/renderer):**
- A4 pionowo, marginesy 40/44 pt;
- fonty: zarejestruj TTF z `brand/fonts/pdf/` (Bricolage 500/650/700, Atkinson 400/600/700) i sprawdź polskie znaki w teście;
- zakreślenie jako `<Svg><Path>` z tą samą ścieżką, zakreślacz jako prostokąt `#FFE14D` pod tekstem, słupki jako prostokąty;
- metadane: tytuł, autor, język `pl`;
- nazwa pliku: `raport-{klient-slug}-{yyyy-mm}.pdf`.

Biblioteka nie tworzy PDF tagowanego. Dostępną wersją raportu jest link, i ten fakt zapisz w `docs/decisions.md`.

---

## 12. Strona marketingowa

**Sekcje i treść** są w `brand/reference/screens/EkranLanding.html` i w `brand/docs/5-ekrany.md`, w tej kolejności:
1. Hero: hasło, podtytuł, dwa CTA, linia prywatności, trzy kroki przepływu i raport na telefonie;
2. „Jak to działa”;
3. „Efekty przed zasięgami”;
4. „Twoja marka na raporcie” i „Pliki i prywatność”;
5. Cennik;
6. Pytania;
7. Darmowe narzędzia;
8. CTA na pasie `secondary`;
9. stopka z informacją prawną.

**Zasady:**
- Strona jest statyczna, tylko w jasnym motywie i bez JavaScriptu poza niezbędnym. FAQ zrób na natywnych `<details>`.
- Cennik czyta `config/pricing.ts`. Plan Studio ma plakietkę „Wkrótce” i przycisk „Powiadom mnie o starcie” z formularzem listy oczekujących (e-mail + zgoda + link do polityki prywatności).
- Darmowy szablon: plakietka „Dostępne” i link tylko, gdy `NEXT_PUBLIC_TEMPLATE_URL` jest ustawione. W przeciwnym razie „Wkrótce” bez linku. Kalkulator wyceny zawsze „Wkrótce”.

**SEO:**
- metadane i `lang="pl"`;
- `sitemap.xml`;
- `robots.txt` z `Disallow: /app` i `/r/`;
- obraz OG 1200 × 630 generowany przez `next/og` według `brand/reference/screens/MaterialyMarketingowe.html`, z fontem Bricolage z TTF;
- favicon i ikony z `brand/app-icons/` + `site.webmanifest` (`theme_color` `#2A3CD4`).

**Poradniki (MDX):**
- infrastruktura + szkic artykułu „Jak zrobić raport z Instagrama dla klienta (Meta Business Suite, 2026)”;
- w szkicu tylko nagłówki i miejsca `[ZRZUT EKRANU: …]`, bez wymyślonych instrukcji klikania;
- pozostałe tytuły z `brand/docs/4-komunikacja.md` dodaj jako listę planowanych artykułów, bez stron.

---

## 13. Wdrożenie systemu marki

- **Style globalne:** skrypt `scripts/build-tokens.ts` generuje `styles/tokens.css` z `brand/tokens.json`, z `@font-face` wskazującym na `public/fonts/` (tam skopiuj WOFF2 z `brand/fonts/web/`). Wynik ma być równoważny `brand/tokens.css`. W `app/globals.css` importuj kolejno `styles/tokens.css` i `brand/components.css`.
  - Wygenerowanego pliku nie edytujesz ręcznie.
  - Dodaj `<link rel="preload">` dla Bricolage.
- **Komponenty w `components/ui/`:** `Button`, `TextField`, `NumberField`, `Upload`, `FileChip`, `Badge`, `Alert`, `Toast` (+ provider), `Modal` (z pułapką fokusu i Esc), `DataTable`, `Tooltip`, `AppNav`, `MonthSwitcher`, `Pagination`, `EmptyState`, `Skeleton`, `Progress`, `KeyNumber`, `Metric`, `Circled`, `Mark`, `Icon`, `Logo`.
  - Każdy tylko składa markup i klasy `sd-*` dokładnie jak w `brand/reference/components/*.html`.
  - Warianty przez propsy (`variant="primary"`, `size="l"`), nie przez nowe style.
- **Ikony:** wygeneruj komponenty z `brand/icons/*.svg`, zamieniając `stroke="#171B33"` na `currentColor`. Ikona dekoracyjna ma `aria-hidden`, a ikona bez tekstu `aria-label`.
- **Logo:** komponent `<Logo variant="default|on-dark|mono-ink|mono-white" height>` z inline SVG z `brand/logo/`. W pasku aplikacji wysokość 24 px, na stronie 28 px, w stopce raportu 12–14 px. Zasady i zakazy są w `brand/docs/3-logo.md`.
- **Strona deweloperska** `/dev/komponenty` (tylko gdy `NODE_ENV !== 'production'`): wszystkie komponenty i stany obok siebie, do porównania z `brand/reference/components/`.

---

## 14. Teksty (`lib/copy/pl.ts`, jedno źródło)

Zasady tonu są w `brand/docs/4-komunikacja.md`. Najważniejsze:
- do SMM-owca na „Ty”;
- raport pisany bezosobowo;
- zdaniowa wielkość liter;
- bez emoji i wykrzykników;
- przycisk i wynik nazywają się tak samo („Kopiuj link” → „Link skopiowany”);
- błąd mówi przyczynę i naprawę.

**Odmiana i formaty (`lib/i18n/pl.ts`, z testami):**
```ts
export const plural = (n: number, [one, few, many]: [string, string, string]) => {
  const n10 = n % 10, n100 = n % 100;
  if (n === 1) return one;
  if (n10 >= 2 && n10 <= 4 && !(n100 >= 12 && n100 <= 14)) return few;
  return many;
};
// 1 osoba, 2–4 osoby, 5–21 osób, 22–24 osoby, 25 osób …
```

| Miesiąc | mianownik („Plan na …”) | dopełniacz („z …”, „1–30 …”) | narzędnik („porównanie z …”) | miejscownik („w …”) |
|---|---|---|---|---|
| 01 | styczeń | stycznia | styczniem | w styczniu |
| 02 | luty | lutego | lutym | w lutym |
| 03 | marzec | marca | marcem | w marcu |
| 04 | kwiecień | kwietnia | kwietniem | w kwietniu |
| 05 | maj | maja | majem | w maju |
| 06 | czerwiec | czerwca | czerwcem | w czerwcu |
| 07 | lipiec | lipca | lipcem | w lipcu |
| 08 | sierpień | sierpnia | sierpniem | w sierpniu |
| 09 | wrzesień | września | wrześniem | **we** wrześniu |
| 10 | październik | października | październikiem | w październiku |
| 11 | listopad | listopada | listopadem | w listopadzie |
| 12 | grudzień | grudnia | grudniem | w grudniu |

**Formaty:**
- liczby: `new Intl.NumberFormat('pl-PL')` (od 5 cyfr spacja nierozdzielająca, 4 cyfry bez spacji);
- kwoty: `{ style: 'currency', currency: 'PLN' }` → „11,07 zł”;
- daty: „1–30 września 2026” (półpauza U+2013).

**Kluczowe teksty** (resztę pisz w tym samym tonie):

| Klucz | Tekst |
|---|---|
| `landing.h1` | Raport, który klient rozumie |
| `landing.lead` | Wgrywasz eksport z Meta Business Suite, dopisujesz trzy liczby i wysyłasz klientowi link. Na górze raportu: ile osób chciało zadzwonić, dojechać i się umówić. Zasięgi niżej. |
| `cta.primary` | Zrób pierwszy raport |
| `cta.secondary` | Zobacz przykładowy raport |
| `privacy.line` | Pierwszy raport bez zakładania konta. Plik zostaje w Twojej przeglądarce. |
| `privacy.card` | Plik CSV czyta Twoja przeglądarka i nie wysyła go na serwer. Gdy tworzysz link do raportu, zapisujemy tylko jego treść: liczby z podsumowania i Twój komentarz. |
| `upload.title` | Wgraj eksport z Meta Business Suite |
| `upload.hint` | Plik CSV z sekcji Statystyki → Treści. Przeciągnij go tutaj albo wybierz z dysku. |
| `upload.success` | Wczytano {n} {publikację/publikacje/publikacji} z {miesiąc.dopełniacz} |
| `E_NOT_CSV` | To nie jest plik CSV. Wgraj plik z rozszerzeniem .csv pobrany z Meta Business Suite. |
| `E_EMPTY` | Plik jest pusty. Pobierz eksport ponownie i wgraj go bez otwierania w Excelu. |
| `E_TOO_BIG` | Plik ma więcej niż 10 MB. Wybierz krótszy okres, na przykład dwa miesiące. |
| `E_MISSING_COLUMNS` | To nie jest eksport treści. W pliku brakuje kolumny „{kolumna}”. Pobierz eksport z zakładki Treści albo przypisz kolumny ręcznie. |
| `E_NO_ROWS_IN_MONTH` | W pliku nie ma publikacji z {miesiąc.dopełniacz}. Plik obejmuje {zakres}. |
| `W_ENCODING_GUESSED` | Plik był zapisany w innym kodowaniu. Sprawdź, czy polskie znaki w podglądzie wyglądają poprawnie. |
| `W_INCOMPLETE_MONTH` | Eksport kończy się {data}. Porównanie z {poprzedni.narzędnik} obejmie {n} dni, nie {m}. Wgraj pełny plik albo zostaw przypis w raporcie. |
| `W_MONTH_IN_PROGRESS` | {Miesiąc} jeszcze trwa. Raport pokaże dane do {data}. |
| `W_METRIC_CHANGE` | W kwietniu 2025 r. Meta zastąpiła metrykę Impressions metryką Views. Starsze miesiące nie są wprost porównywalne, więc raport dodaje przypis dla klienta. |
| `actions.book` / `call` / `directions` | Kliknięcia „Zarezerwuj” · Kliknięcia „Zadzwoń” · Kliknięcia „Wyznacz trasę” |
| `actions.hint` | Panel profesjonalny → Statystyki → Kontakty, {miesiąc}. *(ścieżka do potwierdzenia, sekcja 19)* |
| `report.sourceNote` | Dane: eksport Meta Business Suite i panel profesjonalny Instagrama, {zakres}. |
| `report.metricNote` | Od kwietnia 2025 r. Meta liczy wyświetlenia inaczej niż wcześniej, więc starsze miesiące nie są wprost porównywalne. |
| `report.footer` | Przygotowano w |
| `report.noPrevious` | Brak danych z {miesiąc.dopełniacz} |
| `editor.keyMetricHint` | Ta liczba zostanie zakreślona na górze raportu. |
| `toast.linkCopied` | Link skopiowany |
| `toast.reportSent` | Raport dla {klient} wysłany |
| `empty.clients` | Dodaj pierwszego klienta. Klient to jeden profil na Instagramie. Raporty, historia miesięcy i logo zapisują się przy nim. |
| `empty.history` | Raporty z tego miesiąca pojawią się tutaj. Zacznij od wgrania eksportu. |
| `locked.title` | Ten raport wymaga planu Solo albo pojedynczego zakupu |
| `locked.body` | W planie Na start eksport obejmuje jednego klienta. Możesz kupić ten raport albo przejść na Solo (do 10 klientów, Twoje logo, historia). |
| `share.expired` | Ten raport nie jest już dostępny. Poproś osobę, która go wysłała, o nowy link. |
| `auth.email.subject` | Twój link do logowania w Sedno |
| `auth.checkInbox` | Wysłaliśmy link na {e-mail}. Otwórz go na tym urządzeniu. Link działa przez godzinę. |
| `legal.meta` | Sedno nie jest powiązane z Meta Platforms, Inc. Instagram i Meta Business Suite są znakami towarowymi Meta Platforms, Inc. i występują tu wyłącznie w celu opisania, z jakich plików korzysta narzędzie. |

Czas ważności magic linku w `auth.checkInbox` dopasuj do rzeczywistej konfiguracji Supabase.

---

## 15. Dostępność, wydajność, bezpieczeństwo, RODO

**Dostępność (WCAG 2.2 AA):**
- Kontrast tokenów jest sprawdzony. Nie twórz nowych par kolorów.
- Widoczny fokus (`:focus-visible`, 2 px `--focus`).
- Etykiety nad polami, błędy przez `aria-describedby`.
- Cele dotyku 48 px na telefonie.
- Cały przepływ działa z klawiatury, także wgrywanie przez przycisk.
- Modal z pułapką fokusu, `prefers-reduced-motion` respektowane, status zawsze ze słowem i ikoną.
- Axe bez naruszeń *serious*/*critical* na każdej trasie.

**Wydajność:**
- Strona główna na telefonie: Lighthouse Performance ≥ 90, LCP < 2,5 s (4G), JS na stronie głównej < 80 KB gzip.
- `@react-pdf/renderer` i PapaParse ładuj dynamicznie, dopiero w `/nowy` i edytorze.

**Bezpieczeństwo:**
- Nagłówki: CSP (`self`, Supabase, Stripe), HSTS, `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`.
- Tokeny linków są losowe i kryptograficzne (≥ 128 bitów).
- Limity: wysyłka magic linku, tworzenie linków, `get_shared_report`, zapis zdarzeń i listy oczekujących.
- Walidacja `zod` na wejściu każdej Server Action. Logo tylko PNG/JPEG/WebP ≤ 2 MB.
- Nie loguj treści raportów ani e-maili w logach serwera.

**RODO:**
- Minimalizacja danych: bez opisów postów, bez CSV, bez danych osobowych klientów SMM-owca.
- Dane w UE. Eksport i usunięcie konta w Ustawieniach.
- Strony prawne zawierają miejsca `[DO UZUPEŁNIENIA przez prawnika]`. Nie pisz ostatecznych tekstów prawnych.
- Umowy powierzenia z dostawcami (Supabase, host, Stripe) to zadanie właściciela. Wpisz je do `docs/launch-checklist.md`.

---

## 16. Analityka testu popytu

**Zdarzenia** zapisuj w tabeli `events` przez Server Action z limitem. `anon_id` to losowy identyfikator w `sessionStorage`, bez cookies. Nie zapisuj żadnej treści raportu.

| Zdarzenie | Właściwości |
|---|---|
| `landing_cta_click` | `cta` |
| `csv_parsed` | `rows`, `months`, `ms` |
| `csv_error` | `code` |
| `report_previewed` | `mode: anon/account` |
| `pdf_downloaded` | `mode`, `branding` |
| `signup_completed` | — |
| `link_created` | — |
| `link_opened` | (bez tokenu) |
| `checkout_started` | `product: solo/single` |
| `purchase_completed` | `product` |
| `waitlist_joined` | `plan` |

**`/app/admin/metryki`:** tygodniowy lejek (wejścia CTA → plik wczytany → podgląd → PDF/link → konto → płatność) i liczby bezwzględne. Progi decyzji właściciela to m.in. ≥ 5 płatności w 14 dni.

---

## 17. Testy i kryteria akceptacji

**Testy jednostkowe (Vitest):**
- parser: wszystkie fixtures, kody błędów, liczby, daty, kodowania;
- `computeReport`: sumy, M−1 ze wszystkich źródeł, ostrzeżenia, tytuły dla n = 0, 1, 2, 5, 12, 22, 25;
- `plural` i formaty;
- `entitlements`: każda kombinacja z tabeli w sekcji 9;
- webhook Stripe (idempotencja).

**Testy e2e (Playwright):**
1. **Prywatność pliku.** W fixture umieść unikalny znacznik (np. opis posta `SEDNO-PRIVACY-CANARY-7f3a`). Przejdź cały przepływ `/nowy` i z kontem. Przechwyć wszystkie żądania sieciowe i sprawdź, że żadne ciało żądania nie zawiera znacznika ani bajtów pliku. **Test musi przejść, zanim jakakolwiek wzmianka o prywatności trafi na stronę.**
2. `/nowy`: wgranie, efekty, podgląd, PDF (plik pobrany, poprawne polskie znaki w tekście PDF).
3. Konto: logowanie (mock e-maila), klient, raport, link, otwarcie `/r/[token]` w nowym kontekście, odwołanie linku i komunikat.
4. Uprawnienia: drugi klient na planie darmowym → zablokowany eksport → zakup (Stripe test) → odblokowany.
5. Zrzuty 390 px i 1280 px dla każdej trasy, porównane z `brand/reference/screens/`. Rozbieżności opisz w raporcie z fazy.
6. Axe na każdej trasie.

**Definicja „gotowe” dla każdej fazy:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` przechodzą;
- testy e2e fazy przechodzą;
- brak nowych kolorów i komponentów UI spoza `brand/`;
- teksty pochodzą z `lib/copy/pl.ts`;
- `docs/decisions.md` jest zaktualizowany.

---

## 18. Plan pracy (fazy)

**Faza 0. Fundament.**
- repozytorium i CI;
- import `brand/` i skrypt tokenów;
- fonty;
- komponenty UI i `/dev/komponenty`;
- układy (marketing, aplikacja, raport);
- `CLAUDE.md`, `docs/decisions.md`, `.env.example`.

*Akceptacja:* `/dev/komponenty` wygląda jak `brand/reference/components/` (zrzuty obok siebie), axe czysty.

**Faza 1. Narzędzie bez konta i strona.**
- parser CSV z fixtures i mapowaniem ręcznym;
- `computeReport`;
- `<Report>` i `<ReportPdf>`;
- `/nowy` (3 kroki);
- `/przyklad`;
- strona główna (bez cennika płatnego: Solo jako „Wkrótce” do Fazy 3);
- SEO, ikony;
- test prywatności.

*Akceptacja:* pełny przepływ na telefonie i komputerze, PDF poprawny, test prywatności zielony. **Ta faza nadaje się do testu z prawdziwymi SMM-owcami**, więc zatrzymaj się i poczekaj na decyzję właściciela.

**Faza 2. Konta, klienci, raporty, linki.**
- Supabase (migracje, RLS, testy RLS);
- magic link;
- panel klientów z przełącznikiem miesiąca;
- edytor z zapisem szkicu;
- historia i M−1 z historii;
- linki i `/r/[token]`;
- logo w Ustawieniach;
- eksport i usunięcie konta.

*Akceptacja:* testy e2e 3, RLS uniemożliwia odczyt cudzych danych (test z dwoma użytkownikami).

**Faza 3. Płatności i uprawnienia.**
- `entitlements`;
- Stripe Checkout (Solo, pojedynczy raport), Portal, webhooki;
- stan zablokowany;
- lista oczekujących Studio;
- cennik na stronie z `config/pricing.ts`.

*Akceptacja:* test e2e 4 w trybie testowym Stripe.

**Faza 4. Treści i pomiar.**
- MDX poradników i szkic pierwszego artykułu;
- obraz OG;
- zdarzenia analityczne i `/app/admin/metryki`;
- `docs/launch-checklist.md`.

*Akceptacja:* lejek pokazuje zdarzenia z testów e2e.

---

## 19. Pytania do właściciela (nie blokują pracy)

Zadaj je na początku jedną wiadomością i pracuj dalej na założeniach:

1. **Prawdziwe eksporty CSV**: 3 pliki z Meta Business Suite (interfejs PL, interfejs EN, eksport z telefonu), najlepiej obejmujące dwa miesiące. Opisy postów mogą być wymazane.
2. **Zrzut ekranu panelu profesjonalnego Instagrama** z kontaktami (dokładne polskie nazwy przycisków i ścieżka do statystyk).
3. Dostęp do projektu **Supabase** (region UE) i konta **Stripe** w trybie testowym. Czy BLIK i Przelewy24 są włączone?
4. **Domena** i nadawca e-maili (adres, z którego przychodzi magic link).
5. **Faktury**: w jakim systemie zgodnym z KSeF właściciel wystawia faktury?
6. Wynik sprawdzenia **znaku towarowego „Sedno”** (UPRP/EUIPO). Do tego czasu nazwa produktu jest stałą w `config/brand.ts`.
7. Link do **darmowego szablonu** (Arkusze/Canva), jeśli już istnieje.

---

## 20. Czego nie robić

- Nie wysyłaj pliku CSV ani jego fragmentów na serwer, do logów, do analityki ani do zewnętrznych API.
- Nie łącz się z Meta/Instagram API. Nie proś o hasła ani tokeny klientów. Nie scrapuj profili.
- Nie używaj logo ani gradientu Instagrama. Nie pisz „Insta” ani „Gram”. Nie sugeruj współpracy z Metą.
- Nie dodawaj Tailwinda, bibliotek komponentów, nowych kolorów, gradientów dekoracyjnych, glassmorphismu ani emoji.
- Nie dodawaj AI do komentarzy ani tytułów w MVP.
- Nie wymyślaj opinii, liczby użytkowników, logotypów klientów ani statystyk.
- Nie oznaczaj funkcji jako dostępnych, jeśli nie działają.
- Nie wpisuj cen w treści. Bierz je z `config/pricing.ts`.
- Nie sumuj zasięgu z publikacji.
- Nie generuj faktur VAT. Nie pisz ostatecznych tekstów prawnych.
- Nie edytuj plików w `brand/`.

Sedno to narzędzie dla polskich SMM-owców i freelancerów, którzy prowadzą Instagram kilku lokalnym firmom. Z eksportu Meta Business Suite i trzech liczb z panelu profesjonalnego robi miesięczny raport, który właścicielka salonu, restauracji czy gabinetu rozumie w minutę. Marka jest konkretna, życzliwa i staranna. Jej znakiem jest gest SMM-owca, który długopisem zakreśla na wydruku jedną liczbę, która naprawdę się liczy.

Ten system ma dwie warstwy. **Aplikację** obsługuje SMM-owiec i to on płaci. **Raport** czyta jego klient, a raport należy do marki SMM-owca. Sedno widać w raporcie tylko jako małą stopkę w planie darmowym.

## Treść i ton

- Do SMM-owca mów na „Ty”, krótko i rzeczowo: „Wgraj eksport za wrzesień”. W raporcie nie zwracaj się do klienta formą „Ty” ani „Pan/Pani”. Pisz bezosobowo, bo forma należy do SMM-owca: „23 osoby kliknęły »Zarezerwuj«”.
- Zaczynaj od działań klientów firmy, a zasięgi pokazuj niżej. Nazwy przycisków z Instagrama zawsze bierz w polski cudzysłów: „Zarezerwuj”, „Zadzwoń”, „Wyznacz trasę”. Cudzysłów wewnątrz cudzysłowu to »…«.
- Stosuj zdaniową wielkość liter wszędzie, także w przyciskach, nagłówkach i etykietach. Bez wersalików, bez emoji, bez wykrzykników w komunikatach.
- Przycisk i jego wynik nazywaj tak samo: „Kopiuj link” → „Link skopiowany”. Błąd mówi, co się stało i jak to naprawić, i nie przeprasza.
- Liczby formatuj przez `Intl.NumberFormat('pl-PL')`. Od pięciu cyfr tysiące oddziela twarda spacja U+00A0 (12 480), cztery cyfry zostają bez spacji (1840). Dziesiętne zapisuj przecinkiem (4,9%), a minus prawdziwym znakiem „−”. Daty piszemy „1–30 września 2026”, z półpauzą.
- Nie obiecujemy wzrostu, wyników sprzedaży ani „100% dokładności”. Nie piszemy „AI”, „magia”, „rewolucja”, „w 5 minut” (czasu nie zmierzyliśmy). Pełne zasady i gotowe teksty są w sekcji „Ton i teksty”.
- Nazwy Instagram i Meta Business Suite stosujemy tylko opisowo („eksport z Meta Business Suite”). Nigdy w logo ani w nazwie planu, bez gradientu i bez znaku Instagrama. Strona i stopka maili mają informację, że Sedno nie jest powiązane z Meta Platforms.

## Kolor

- `paper` to tło, a `surface` to obiekty na nim: karty, tabele, pola. Granice zaznaczaj obrysem `line`. Cień `shadow-2` dostaje tylko `surface-raised` (modal, menu, toast).
- `pen` (Długopis) oznacza jedno główne działanie na widok, linki, fokus i dane bieżącego miesiąca. Na wypełnieniu `pen` tekst jest w kolorze `on-pen`, a nie białym na sztywno.
- `marker` (Zakreślacz) jest wyłącznie tłem: pasek pod jedną liczbą albo jednym zdaniem komentarza. Nigdy nie jest tekstem, obrysem na białym ani statusem. Tekst na nim ma kolor `on-marker`.
- `secondary` (Atrament) z `on-secondary` stosuj w tooltipach, plakietce planu i ciemnym pasie CTA na stronie.
- Statusy `success`, `warning`, `error` i `info` zawsze idą w parze z ikoną i słowem. Success i error mają podobną jasność, więc sam kolor niczego nie mówi. Plakietki i alerty mają tło `*-soft`.
- Tokeny `report-*` (arkusz raportu) mają te same wartości w obu motywach. Raport jest zawsze jasny, bo jest drukowany i przekazywany dalej.
- Strona marketingowa i raport są tylko jasne. Aplikacja startuje w jasnym motywie, a ciemne wartości są przygotowane i sprawdzone na fazę 2. Żeby treść została jasna w dowolnym motywie, wystarczy owinąć ją w `data-theme="light"`.
- Kontrast jest sprawdzony skryptem (WCAG 2.2): `ink` na `paper` ma 15,7:1, `ink-muted` na `surface-sunken` 4,6:1, a `pen` na `paper` 7,2:1. Obrys kontrolek `line-strong` ma co najmniej 3,4:1 na każdej jasnej powierzchni. W ciemnym motywie `ink-muted` na `surface-raised` ma 5,2:1. `ink-muted` na `pen-soft` ma 4,5:1, więc nadaje się tylko na krótkie podpisy.

## Typografia

- Bricolage Grotesque (`display`) stosuj w nagłówkach i we **wszystkich liczbach**: metrykach, tabelach, kwotach i polach liczbowych. Ma cyfry tabelaryczne i oś optycznego rozmiaru. Klasa `sd-num` albo style `number-hero`, `number-l` i `table-number`.
- Atkinson Hyperlegible Next (`text`) stosuj w tekście i interfejsie. Został zaprojektowany z myślą o czytelności dla osób słabowidzących, co dobrze pasuje do raportu czytanego na telefonie. Ma przekreślone zero, więc liczb, które ktoś porównuje, nie składamy w nim. Nie ma znaku U+202F, dlatego tysiące oddziela U+00A0.
- Oba kroje są na licencji SIL OFL i mają pełne polskie znaki, sprawdzone w plikach razem z „ ” i −. Pliki WOFF2 w `fonts/` są przycięte do łaciny z polskimi znakami i mają zmienną grubość 200–800.
- Skala: `display-xl` 64 px tylko w hero, `display-l` 44 px w tytułach sekcji strony, `heading-1` 32, `heading-2` 24, `heading-3` 19, `body-l` 18, `body` 16, `body-s` 14, `label` 14/600, `caption` 13. Poniżej 768 px hero ma 40 px, a `number-hero` 56 px.
- Tekst ciągły nie przekracza 64 znaków w wierszu (`container-text` 640 px). Nagłówki mają `text-wrap: balance`.

## Układ i odstępy

- Siatka opiera się na 4 px. Między polami stosuj `space-4`, padding karty to `space-5` (na telefonie `space-4`), między sekcjami w aplikacji `space-6`, a na stronie `space-9` (na telefonie `space-8`).
- Kontenery: strona `container-site` 1120 px, aplikacja `container-app` 1280 px, raport `report-sheet` 720 px. Raport w PDF ma format A4 pionowy.
- Projektuj od telefonu. Punkty przełamania to 480, 768, 1024 i 1280 px. Na telefonie wszystkie pola i główne przyciski mają wysokość `control-l` 48 px. Tabele zamieniają się w karty poniżej 768 px.
- Promienie: `radius-s` 6 px dla kontrolek, `radius-m` 10 px dla kart, `radius-l` 16 px dla raportu i modali, `radius-pill` tylko dla plakietek statusu i przełącznika miesiąca. Różne promienie oddają hierarchię, więc nie ujednolicaj ich.

## Motyw graficzny

- **Zakreślenie** (`sd-circled`) to pętla długopisu w kolorze `pen` wokół jednej kluczowej liczby na ekranie lub w raporcie. **Zakreślacz** (`sd-mark`) podkreśla jedno zdanie komentarza. Na jednym widoku stosuj najwyżej jeden z tych gestów, nigdy oba naraz.
- Przepływ danych pokazujemy zawsze jako ten sam ciąg: plik CSV → trzy liczby → raport na telefonie. Kroki numerujemy, bo to prawdziwa kolejność. Nie rysujemy abstrakcyjnych diagramów ani strzałek z gradientem.
- Najlepszą grafiką jest prawdziwy ekran: raport na telefonie, arkusz A4, chip pliku. Nie używamy zdjęć stockowych, ludzi w garniturach, monet, wykresów giełdowych ani ilustracji „AI”.
- Gradienty nie występują. Wyjątkiem jest twardy pasek zakreślacza zrobiony z `linear-gradient` o ostrych przejściach.

## Ikony

- Zestaw jest własny: siatka 24 px, linia 1,75 px, zaokrąglone końce, bez wypełnień. Ikony są w `assets/Ikony/`, a w kodzie wklejane inline z `stroke="currentColor"` (klasa `sd-icon`). Pliki SVG do `<img>` mają atrament `#171B33`.
- Ikona stoi przed tekstem, z odstępem `space-2`. Sama ikona bez tekstu pojawia się tylko w paskach narzędzi i zawsze z `aria-label`.
- Trzy ikony efektów (`phone`, `route`, `booking`) zawsze stoją przy etykietach „Zadzwoń”, „Wyznacz trasę” i „Zarezerwuj”.

## Logo

- `sedno-logo.svg` na jasnym tle, `sedno-logo-on-dark.svg` na `secondary` i ciemnym. Na kolorowych tłach i w druku jednokolorowym stosuj wersje mono. Minimalna szerokość to 72 px na ekranie i 18 mm w druku. Poniżej 20 px stosuj `sedno-favicon.svg`. Pole ochronne, warianty i zakazy opisuje sekcja „Logo”.

## Ruch i stany

- Ruch pojawia się tylko w odpowiedzi na działanie: spinner w przycisku, toast, połysk szkieletu. Wszystkie te animacje wyłączają się przy `prefers-reduced-motion`. Na stronie dozwolone jest jedno narysowanie pętli w hero.
- Fokus to ciągły obrys 2 px w kolorze `focus` z odstępem 2 px, na każdym elemencie interaktywnym.
- Niedostępny przycisk ma `aria-disabled="true"`, a nie `disabled`, i wyjaśnia, czego brakuje. Brak danych oznaczamy „—”, nigdy zerem.

## Raport dla klienta

Kolejność jest stała:
1. marka SMM-owca, klient i miesiąc;
2. jedno zdanie-tytuł („23 osoby chciały się umówić”);
3. kluczowa liczba z zakreśleniem;
4. dwie pozostałe liczby efektów z porównaniem do poprzedniego miesiąca;
5. komentarz SMM-owca z jednym zdaniem zakreślaczem;
6. zasięg (słupki `report-pen` i `report-previous`);
7. przypis o źródle danych i zmianach metryk Mety;
8. stopka.

Spadek pokazujemy tak samo spokojnie jak wzrost: bez czerwieni i bez strzałek.

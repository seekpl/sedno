# Logo

## Idea i konstrukcja

Logotyp to słowo „sedno” złożone z Bricolage Grotesque Bold, z optycznym rozmiarem 36. Litery zamieniono na krzywe, więc logo nie zależy od zainstalowanego fontu. Ostatnie „o” to pętla długopisu wokół kropki: „trafić w sedno” i jednocześnie zakreślenie najważniejszego.

- **Pętla:** elipsa obrócona o −14°, kreska o grubości 78/1000 wysokości kroju, zaokrąglone końce. Koniec linii zachodzi na początek w lewym górnym rogu, tak jak przy rysowaniu kółka długopisem.
- **Kropka:** promień 66/1000, w środku pętli.
- **Kolory:** litery i kropka w kolorze `ink`, pętla w kolorze `pen`. Na ciemnym tle litery są w `ink` motywu ciemnego, pętla w `pen` ciemnym, a kropka w `marker`.

## Warianty (w `assets/Logo/`)

| Plik | Kiedy |
|---|---|
| `sedno-logo.svg` | Domyślny, na `paper`, `surface` i białym |
| `sedno-logo-on-dark.svg` | Na `secondary` i ciemnych tłach, w ciemnym motywie aplikacji |
| `sedno-logo-mono-ink.svg` | Druk jednokolorowy, faksy, pieczątki, tła jasne kolorowe |
| `sedno-logo-mono-white.svg` | Na `pen` i zdjęciach (tylko z ciemną winietą) |
| `sedno-logo-z-haslem.svg`, `…-on-dark.svg` | Strona, stopki, prezentacje: logo z hasłem „raport, który klient rozumie” |
| `sedno-sygnet.svg`, `…-on-dark.svg` | Sama pętla z kropką: awatar w mediach, znak wodny, małe formaty kwadratowe |
| `sedno-app-icon.svg` + PNG 180/192/512 | Ikona aplikacji, ekran główny, PWA |
| `sedno-favicon.svg` + PNG 16/32/48 | Karta przeglądarki. Pętla jest tu uproszczona do zamkniętej elipsy, bo zakładka znika przy 16 px |

Wersja pionowa nie jest potrzebna. Logotyp jest krótki (proporcja ok. 3,6:1), więc w formatach kwadratowych stosujemy sygnet albo ikonę aplikacji. Druga kompozycja byłaby kolejnym plikiem do pilnowania bez nowego zastosowania.

## Pole ochronne i rozmiary

- **Pole ochronne:** wysokość litery „n” (wysokość x) z każdej strony logotypu. Dla sygnetu i ikony to 25% boku.
- **Minimalne rozmiary:**
  - logotyp: 72 px szerokości na ekranie, 18 mm w druku;
  - sygnet: 20 px;
  - poniżej 20 px tylko favicon.
- W pasku aplikacji logo ma 24 px wysokości, na stronie 28 px, a w stopce raportu 12–14 px.
- Na raporcie dla klienta logo SMM-owca zawsze stoi wyżej i jest większe niż Sedno.

## Zakazy

- Nie zamieniaj pętli na zwykłe „o” i nie zamykaj jej w kółku.
- Nie obracaj, nie pochylaj i nie rozciągaj logo. Nie zmieniaj odstępów między literami.
- Nie barw pętli na żółto na jasnym tle, bo nie ma kontrastu. Nie dodawaj cieni, obrysów ani gradientów.
- Nie stawiaj logo obok znaku Instagrama ani na gradiencie w stylu Instagrama. Nie twórz wersji z „Insta” lub „Gram”.
- W tekście pisz nazwę „Sedno”, z wielkiej litery, bez wersalików. Małe litery są tylko w logotypie.

# Przekazanie do wdrożenia

## Źródło prawdy

Wartości kolorów, odstępów, promieni, cieni, rozmiarów i typografii są w `tokens.json`. Strona systemu generuje z niego `tokens.css`. Komponenty to czyste CSS z prefiksem `sd-` w `components/bundle.css` i przykładowy HTML w `components/<Nazwa>/preview.html`. Nie ma w nich zależności od frameworka, więc w React, Next.js czy SvelteKit wystarczy przenieść klasy do komponentów albo zmapować tokeny na Tailwind (`theme.extend.colors.pen = 'var(--pen)'` i tak dalej).

## Zmienne CSS

```css
:root, [data-theme="light"] {
  --paper: #F5F6FA;
  --surface: #FFFFFF;
  --surface-raised: #FFFFFF;
  --surface-sunken: #ECEEF5;
  --line: #DADDE8;
  --line-strong: #7A809B;
  --ink: #171B33;
  --ink-secondary: #454B67;
  --ink-muted: #636987;
  --pen: #2A3CD4;
  --pen-hover: #2131B0;
  --pen-active: #19268C;
  --on-pen: #FFFFFF;
  --pen-soft: #E7EAFC;
  --secondary: #171B33;
  --on-secondary: #FFFFFF;
  --marker: #FFE14D;
  --marker-soft: #FFF5BF;
  --on-marker: #171B33;
  --success: #1B7547;
  --success-soft: #E2F3E9;
  --warning: #8F5400;
  --warning-soft: #FFF0D4;
  --error: #BE2F28;
  --error-soft: #FCE7E5;
  --info: #0E6683;
  --info-soft: #E0F1F6;
  --focus: var(--pen);
  --chart-current: var(--pen);
  --chart-previous: #8E94AE;
  --chart-grid: #E6E8F0;
  --report-paper: #FFFFFF;
  --report-ink: #171B33;
  --report-ink-secondary: #454B67;
  --report-line: #DADDE8;
  --report-pen: #2A3CD4;
  --report-previous: #8E94AE;
  --shadow-1: 0 1px 2px rgba(23, 27, 51, 0.08);
  --shadow-2: 0 12px 32px rgba(23, 27, 51, 0.14), 0 2px 6px rgba(23, 27, 51, 0.08);
}
[data-theme="dark"] { /* faza 2: tylko aplikacja */
  --paper: #0E1120;
  --surface: #161A2E;
  --surface-raised: #1E2340;
  --surface-sunken: #0A0C18;
  --line: #2C3252;
  --line-strong: #6C7398;
  --ink: #EEF0F8;
  --ink-secondary: #BCC1D6;
  --ink-muted: #9095B0;
  --pen: #8D9BFF;
  --pen-hover: #A6B1FF;
  --pen-active: #C3CAFF;
  --on-pen: #0E1120;
  --pen-soft: #232A55;
  --secondary: #EEF0F8;
  --on-secondary: #0E1120;
  --marker-soft: #4A4214;
  --success: #62D193;
  --success-soft: #15301F;
  --warning: #F3B64B;
  --warning-soft: #33260A;
  --error: #FF8B82;
  --error-soft: #3A1614;
  --info: #5CC3E2;
  --info-soft: #0F2A33;
  --chart-previous: #6C7398;
  --chart-grid: #252A47;
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-2: 0 12px 32px rgba(0, 0, 0, 0.55);
  color-scheme: dark;
}
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;
  --space-9: 96px;
  --radius-s: 6px;
  --radius-m: 10px;
  --radius-l: 16px;
  --radius-pill: 999px;
  --control-s: 32px;
  --control-m: 40px;
  --control-l: 48px;
  --container-site: 1120px;
  --container-app: 1280px;
  --container-text: 640px;
  --report-sheet: 720px;
  --font-display: "Bricolage Grotesque", "Segoe UI", system-ui, sans-serif;
  --font-text: "Atkinson Hyperlegible Next", "Segoe UI", system-ui, sans-serif;
}
@font-face { font-family: "Bricolage Grotesque"; src: url("/fonts/BricolageGrotesque-Variable.woff2") format("woff2"); font-weight: 200 800; font-display: swap; }
@font-face { font-family: "Atkinson Hyperlegible Next"; src: url("/fonts/AtkinsonHyperlegibleNext-Variable.woff2") format("woff2"); font-weight: 200 800; font-display: swap; }
```

## Implementacja: zasady, które łatwo przeoczyć

- **Fonty:** hostuj własne pliki WOFF2 z `fonts/`, nie z Google Fonts. Szybciej się ładują, a ruch nie trafia do zewnętrznej firmy (RODO). Dodaj `<link rel="preload">` dla Bricolage, bo hero i liczby renderują się nim od pierwszej klatki.
- **Liczby:** `new Intl.NumberFormat('pl-PL')` (twarda spacja od 5 cyfr), kwoty `{style:'currency',currency:'PLN'}`, procenty z przecinkiem. Liczby zawsze z klasą `sd-num` (Bricolage, cyfry tabelaryczne).
- **Cudzysłowy:** w treściach „ ” i » «, nigdy " ". Nazwy przycisków Instagrama są w stałych tłumaczeniach, a nie w interpolowanym tekście.
- **Raport:** kontener `sd-report` + `data-theme="light"`. Generuj PDF z tego samego HTML (np. Playwright `page.pdf({format:'A4'})`), żeby link i PDF wyglądały tak samo. PDF ma być tagowany.
- **Pętla zakreślenia:** inline SVG z `preserveAspectRatio="none"` i `vector-effect: non-scaling-stroke`. Ścieżka jest w `components/Circled/preview.html`.
- **Focus:** nie usuwaj `outline`. Reguła `:focus-visible` w bundle.css obejmuje linki, przyciski i pola.
- **Ciemny motyw:** w aplikacji dopiero w fazie 2. Przełącznik ustawia `data-theme` na `<html>`, a raport i strona marketingowa mają własne `data-theme="light"`.

## Assety

Gotowe w systemie:
- logotypy SVG (6 wariantów + 2 z hasłem);
- sygnet (2);
- ikona aplikacji SVG + PNG 180, 192, 512;
- favicon SVG + PNG 16, 32, 48;
- 22 ikony interfejsu SVG;
- fonty WOFF2 (2 pliki zmienne).

Do przygotowania przed startem:
1. `site.webmanifest` z ikonami 192/512 i `theme_color` `#2A3CD4`.
2. Obraz udostępniania 1200 × 630 (kierunek: strona „MaterialyMarketingowe”) dla strony głównej i szablonu.
3. Szablon raportu w Arkuszach Google i w Canvie (obiecany na stronie jako „Dostępne”).
4. Zrzuty ekranu „jak zrobić eksport” z Meta Business Suite, po polsku, na komputerze i telefonie.
5. Szablon PDF raportu (generowany z HTML) i szablony e-maili (wysłanie raportu, faktura, reset hasła).
6. Polityka prywatności i regulamin opisujące rzeczywisty przepływ pliku.
7. Prawdziwe zrzuty ekranów aplikacji po zbudowaniu MVP, które zastąpią makiety na stronie.

## Do sprawdzenia przed publikacją

- Dokładne polskie nazwy przycisków kontaktowych i ścieżki do statystyk w aktualnej aplikacji Instagram i w Meta Business Suite. Na makietach są „Zarezerwuj”, „Zadzwoń”, „Wyznacz trasę” i „Statystyki → Treści → Eksportuj dane”. Mogą się różnić.
- Nazwy kolumn w eksporcie CSV (komunikat błędu powołuje się na kolumnę „Wyświetlenia”).
- Czy plik naprawdę jest przetwarzany tylko w przeglądarce. Od tego zależą obietnice na stronie, w uploadzie i w reklamie nr 5.
- Znak towarowy „Sedno” (UPRP, EUIPO) i domeny.
- Ceny planów: propozycja do testu, nie decyzja.

## Czego ten system nie zawiera

- Nie ma pliku Figma ani gotowych komponentów React. Są tokeny, CSS i przykładowy HTML.
- Nie ma ilustracji ani fotografii, bo marka ich nie potrzebuje: grafiką są prawdziwe ekrany.
- Logotyp jest zbudowany z krzywych kroju Bricolage Grotesque (OFL), dlatego warto potwierdzić u prawnika, czy znak oparty na kroju OFL można zarejestrować. Licencja OFL pozwala używać kroju w logo.

## Licencje fontów

Bricolage Grotesque (Copyright 2022 The Bricolage Grotesque Project Authors) i Atkinson Hyperlegible Next (Copyright 2020–2024 The Atkinson Hyperlegible Next Project Authors) są udostępnione na licencji SIL Open Font License 1.1. Pliki w `fonts/` są podzbiorami oryginałów (łacina z polskimi znakami). Przy dystrybucji fontów (np. w repozytorium aplikacji) dołącz pliki licencji OFL. Licencja nie dotyczy dokumentów i obrazów utworzonych przy użyciu fontów, w tym logotypu.

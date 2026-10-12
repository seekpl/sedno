# Paczka marki Sedno

Źródło prawdy dla wyglądu aplikacji. Skopiuj folder do repozytorium jako `/brand` i nie edytuj plików w miejscu. Zmiany kolorów i typografii robi się w `tokens.json` i ponownie generuje `tokens.css`.

| Ścieżka | Co to jest | Jak użyć |
|---|---|---|
| `tokens.json` | Wszystkie tokeny: kolory (motyw jasny i ciemny), typografia, odstępy, promienie, cienie, rozmiary | Źródło prawdy; skrypt `scripts/build-tokens` w aplikacji generuje z niego CSS |
| `tokens.css` | Zmienne CSS (`--paper`, `--pen`, `--space-4`…), `@font-face`, klasy stylów tekstu (`.heading-1`, `.number-hero`…) | Import globalny jako pierwszy arkusz |
| `components.css` | Komponenty jako klasy `sd-*` (przyciski, pola, upload, plakietki, alerty, tabela, raport) | Import globalny po `tokens.css`; komponenty React tylko nakładają te klasy |
| `logo/` | Logotyp (6 wariantów + 2 z hasłem) i sygnet, SVG | Inline SVG w komponencie `<Logo variant>`; patrz `docs/3-logo.md` |
| `app-icons/` | Ikona aplikacji i favicon: SVG + PNG 16/32/48/180/192/512 | `app/icon.svg`, `apple-icon.png`, `site.webmanifest` |
| `icons/` | 22 ikony interfejsu, siatka 24, linia 1,75 | Jako komponenty React z `stroke="currentColor"` (pliki mają `#171B33` tylko do podglądu) |
| `fonts/web/` | Bricolage Grotesque i Atkinson Hyperlegible Next, WOFF2, zmienna grubość, łacina + polskie znaki | Hostowane w aplikacji (`public/fonts`), preload Bricolage |
| `fonts/pdf/` | Te same kroje jako statyczne TTF (500/650/700 i 400/600/700) | Rejestracja w `@react-pdf/renderer` (biblioteka nie czyta WOFF2 ani fontów zmiennych) |
| `fonts/OFL-*.txt` | Licencje SIL OFL 1.1 | Dołącz do repozytorium razem z fontami |
| `docs/` | Zasady marki, strategia, kierunki, logo, ton i teksty, ekrany, przekazanie | Czytaj przed pisaniem UI i tekstów |
| `reference/screens/` | Makiety ekranów jako samodzielne HTML | Otwórz w przeglądarce; to wzorzec wyglądu, nie kod do skopiowania |
| `reference/components/` | Podglądy komponentów z wariantami i stanami | Wzorzec dla komponentów React |

Wszystkie dane na makietach są przykładowe (Studio Lumi, Kadr Social, Bistro Pod Lipą to zmyślone marki).

# Faza 0 — przegląd zrzutów

Pełne arkusze porównawcze: `faza-0.zip` (lewa kolumna: Sedno, prawa: makieta z `brand/reference/`).

| Plik w paczce                              | Zawartość                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| `komponenty-1280.png`                      | 15 podstron `/dev/komponenty/*` obok `brand/reference/components/*.html`, 1280 px |
| `komponenty-390.png`                       | to samo, 390 px                                                                   |
| `uklad-strony.png`, `uklad-strony-390.png` | nagłówek i stopka strony marketingowej                                            |

## Rozbieżności

| #   | Co                                                                                            | Gdzie                                           | Stan                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Mniejszy odstęp pod linią prywatności w stanie podstawowym Upload                             | `/dev/komponenty/upload` vs `Upload.html`       | Zostaje. Podglądy komponentów nie zerują marginesów `<p>` (domyślne 16 px), a ekrany w `brand/reference/screens/` zerują — aplikacja trzyma się ekranów (decyzja 12). |
| 2   | Tabela na 390 px zamienia się w karty                                                         | `/dev/komponenty/datatable` vs `DataTable.html` | Zgodnie z §10 i `5-ekrany.md` („tabela od 768 px, poniżej karty”). Makieta komponentu nie ma wersji mobilnej.                                                         |
| 3   | Działania w kartach tabeli były wewnątrz `<dl>` bez `dt/dd` (naruszenie axe _serious_)        | `components/ui/DataTable.tsx`                   | Poprawione przed commitem Fazy 0.                                                                                                                                     |
| 4   | Etykieta miesiąca „Wrz 2026” łamała się na dwie linie                                         | pasek aplikacji, 390 px                         | Poprawione (`white-space: nowrap`).                                                                                                                                   |
| 5   | Pasek aplikacji wystawał poza 390 px (logo + przełącznik + plakietka planu + menu)            | `/dev/komponenty/appnav`                        | Poprawione: plakietka planu od 768 px; na telefonie logo, przełącznik i menu jak w `EkranWgrywanie.html`. Test e2e pilnuje braku przewijania w poziomie.              |
| 6   | Na 390 px makiety komponentów (np. AppNav, DataTable) nie są responsywne i wystają poza ekran | prawa kolumna arkusza 390 px                    | Różnica po stronie makiety, nie aplikacji.                                                                                                                            |
| 7   | Strona główna to tymczasowy nagłówek                                                          | `/`                                             | Zgodnie z planem: pełna strona w Fazie 1.                                                                                                                             |

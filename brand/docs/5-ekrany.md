# Ekrany i strona

Kierunek wizualny każdego ekranu jest na stronach w grupie „Ekrany”. Wszystkie dane na makietach są przykładowe, a marki (Studio Lumi, Kadr Social, Bistro Pod Lipą) zmyślone.

## Strona marketingowa (EkranLanding, EkranLandingMobile)

Strona jest tylko w jasnym motywie. Sekcje idą w tej kolejności:

1. **Hero:** hasło, podtytuł, dwa CTA i linia prywatności, a pod nimi trzy kroki przepływu (plik → trzy liczby → wysyłka) oraz raport na telefonie z zakreśloną liczbą. Hero nie opiera się na abstrakcyjnej grafice, tylko pokazuje prawdziwy wynik.
2. **Jak to działa:** trzy numerowane kroki (to prawdziwa kolejność).
3. **Efekty przed zasięgami:** obok siebie typowy raport z zasięgami i raport Sedno z kluczową liczbą.
4. **Twoja marka na raporcie** oraz **Pliki i prywatność**: dwie karty.
5. **Cennik:** Na start, Solo i Studio („Wkrótce”) oraz pojedynczy raport za 9 zł. Ceny netto, płatność kartą lub BLIK.
6. **Pytania:** łączenie kont, skąd wziąć liczby, czy klient zakłada konto, czy to narzędzie Mety.
7. **Darmowe narzędzia:** szablon raportu (dostępny w dniu startu) i kalkulator wyceny („Wkrótce”).
8. **CTA na pasie `secondary`**, potem stopka z informacją prawną o znakach Meta.

Na telefonie: hero w jednej kolumnie, CTA na całą szerokość (48 px), raport pod CTA, menu pod przyciskiem 48 × 48 px.

## Aplikacja

| Ekran | Strona | Najważniejsze |
|---|---|---|
| Wgrywanie | EkranWgrywanie | Telefon: wybór pliku, podpowiedź, gdzie zrobić eksport, linia prywatności. Po wczytaniu chip pliku i liczba publikacji. |
| Uzupełnianie efektów | EkranWgrywanie, EkranUzupelnij | Trzy pola liczbowe z wartościami z poprzedniego miesiąca pod spodem, wybór kluczowej liczby, komentarz i plan, ostrzeżenie o niepełnych danych, podgląd raportu na żywo. |
| Raport dla klienta | EkranRaport | Link na telefonie i PDF A4, zawsze jasne. Kolejność opisana w README. |
| Panel klientów | EkranPanel | Przełącznik miesiąca, postęp „2 z 5 wysłanych”, tabela klientów z liczbami i statusem, toast z cofnięciem. |
| Plan i płatność | EkranCennik | Limit planu w liczbach, karty planów, zakup pojedynczego raportu z VAT i wyborem BLIK lub karty, przycisk z kwotą. |

## Stany interfejsu

- **Pusty:** `EmptyState`, z czasownikiem i przykładem.
- **Ładowanie:** `Skeleton` i licznik publikacji.
- **Błąd:** `Alert` error z przyczyną i naprawą.
- **Sukces:** `Alert` success z działaniami i `Toast`.
- **Niepełne dane:** `Alert` warning z liczbą dni.
- **Brak danych w tabeli:** „—”.
- **Przycisk niedostępny:** `aria-disabled` z wyjaśnieniem w podpowiedzi.

## Responsywność i dostępność

- Projektujemy od 360 px. Tabela zamienia się w karty poniżej 768 px, a podgląd raportu na żywo pojawia się od 1024 px. Na telefonie podgląd jest osobnym krokiem „Zobacz raport”.
- Cel dotyku na telefonie ma co najmniej 48 × 48 px. Cały przepływ działa z klawiatury: wgrywanie przez przycisk, pola w kolejności czytania, Esc zamyka modal.
- Etykiety są widoczne nad polami, a błędy powiązane przez `aria-describedby`. Status zawsze ma słowo i ikonę.
- Kontrast tekstu wynosi co najmniej 4,5:1, a kontrolek i fokusu co najmniej 3:1 w obu motywach. Raport ma deklarację `lang="pl"` i nagłówki w hierarchii. PDF trzeba eksportować jako tagowany (zadanie na wdrożenie).

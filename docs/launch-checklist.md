# Lista kontrolna przed publicznym startem

Zadania właściciela i warunki, które muszą być spełnione przed publikacją. Odhaczaj z datą.

## Dane i parser

- [ ] Wszystkie prawdziwe eksporty z `tests/fixtures/private/` (PL, EN, z telefonu) przechodzą **bez mapowania ręcznego** kolumn (`pnpm test` z plikami `real-*.csv`).
- [ ] Dokładne polskie nazwy przycisków kontaktowych i ścieżka do statystyk w panelu profesjonalnym potwierdzone na zrzucie (teksty `actions.*` i `actions.hint`).
- [ ] Ścieżka eksportu w Meta Business Suite potwierdzona i poradnik „Jak zrobić raport z Instagrama dla klienta” uzupełniony prawdziwymi zrzutami.

## Bezpieczeństwo

- [ ] Sprawdzić, czy SRI/hashe w aktualnym Next.js (`experimental.sri`) pozwalają usunąć `'unsafe-inline'` ze `script-src` na stronach marketingowych.
- [ ] Limity zapisu (lista oczekujących, zdarzenia) przeniesione z pamięci procesu do trwałego magazynu, jeśli hosting uruchamia wiele instancji.
- [ ] Przegląd nagłówków na produkcyjnej domenie (CSP bez naruszeń w konsoli, HSTS).

## RODO i umowy

- [ ] Umowy powierzenia przetwarzania (DPA) z dostawcami: Supabase, hosting (np. Vercel), Stripe.
- [ ] Projekt Supabase w regionie UE; hosting w UE (np. `fra1`).
- [ ] Polityka prywatności i regulamin napisane przez prawnika (miejsca `[DO UZUPEŁNIENIA przez prawnika]`), opisują rzeczywisty przepływ pliku, listę oczekujących i zdarzenia analityczne.

## Marka i prawo

- [ ] Wynik sprawdzenia znaku „Sedno” (UPRP, EUIPO) i dostępność domeny.
- [ ] Faktury: system zgodny z KSeF wybrany z księgową (Sedno nie wystawia faktur samo).
- [ ] Darmowy szablon gotowy i `NEXT_PUBLIC_TEMPLATE_URL` ustawione (inaczej strona pokazuje „Wkrótce”).

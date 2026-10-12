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

## Baza i konfiguracja

- [ ] Migracja `supabase/migrations/20261012000000_waitlist_events.sql` uruchomiona w projekcie Supabase w UE.
- [ ] `SEDNO_DEV_STORE_DIR` **nieustawione** na produkcji (inaczej przy braku zmiennych Supabase e-maile trafiłyby do pliku).
- [ ] Limity zapytań zakładają, że hosting ustawia `X-Forwarded-For`/`X-Real-IP` na adres klienta (Vercel tak robi). Za proxy, które tylko dopisuje adres, trzeba brać ostatni zaufany adres.

## RODO i umowy

- [ ] Okres przechowywania wpisów listy oczekujących i zdarzeń (decyzja z prawnikiem; ewentualnie zadanie czyszczące).
- [ ] Lista oczekujących bez podwójnego potwierdzenia (double opt-in): ktoś może zapisać cudzy adres. Decyzja właściciela i prawnika, np. link potwierdzający przed wysyłką o starcie.

- [ ] Umowy powierzenia przetwarzania (DPA) z dostawcami: Supabase, hosting (np. Vercel), Stripe.
- [ ] Projekt Supabase w regionie UE; hosting w UE (np. `fra1`).
- [ ] Polityka prywatności i regulamin napisane przez prawnika (miejsca `[DO UZUPEŁNIENIA przez prawnika]`), opisują rzeczywisty przepływ pliku, listę oczekujących i zdarzenia analityczne.

## Marka i prawo

- [ ] Wynik sprawdzenia znaku „Sedno” (UPRP, EUIPO) i dostępność domeny.
- [ ] Faktury: system zgodny z KSeF wybrany z księgową (Sedno nie wystawia faktur samo).
- [ ] Darmowy szablon gotowy i `NEXT_PUBLIC_TEMPLATE_URL` ustawione (inaczej strona pokazuje „Wkrótce”).

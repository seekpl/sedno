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
- [ ] `NEXT_PUBLIC_SITE_URL` ustawione na produkcyjną domenę (adres kanoniczny, Open Graph, sitemap i robots; bez niego wskazują `http://localhost:3000`).
- [ ] `SEDNO_DEV_STORE_DIR` **nieustawione** na produkcji (inaczej przy braku zmiennych Supabase e-maile trafiłyby do pliku).
- [ ] Limity zapytań zakładają, że hosting ustawia `X-Forwarded-For`/`X-Real-IP` na adres klienta (Vercel tak robi). Za proxy, które tylko dopisuje adres, trzeba brać ostatni zaufany adres. Dotyczy też logowania (5 próśb o link na 10 minut z IP) i raportu publicznego /r (60 otwarć na minutę z IP) — bez nagłówka wszyscy dzielą jeden limit.
- [ ] Migracje konta (`20261013000000_accounts.sql`, `20261013000100_accounts_hardening.sql`) uruchomione w projekcie Supabase w UE; po migracji `pnpm test:db` przeciw lokalnemu stosowi zielony (tests/db/security-catalog.test.ts pilnuje grantów i RLS).
- [ ] Prywatny zasobnik `logos` istnieje w Storage (migracja tworzy go, gdy jest schemat `storage`), bez publicznego dostępu i bez polityk na `storage.objects`.
- [ ] Supabase Auth: własny SMTP z serwerami w UE (umowa powierzenia, domena nadawcy z SPF, DKIM i DMARC); wbudowany SMTP Supabase ma bardzo niski limit — podnieść `auth.rate_limit.email_sent`.
- [ ] Supabase Auth: szablony i tematy e-maili z `supabase/templates` (generuje `pnpm emails`) wgrane w panelu albo przez `supabase config push` (ustawienia opisuje `supabase/config.toml`).
- [ ] Supabase Auth: `site_url` = `NEXT_PUBLIC_SITE_URL`, dozwolony adres powrotu tylko `https://<domena>/auth/potwierdz**`, `otp_expiry` = 3600 s (tekst „Link działa przez godzinę”), logowanie wyłącznie e-mailem.
- [ ] Logowanie sprawdzone z aplikacji Gmail i Outlook na iOS (link otwiera się w przeglądarce wbudowanej, która nie ma weryfikatora PKCE) i ze skrzynki Microsoft 365 z Safe Links (skaner może zużyć jednorazowy link). Decyzja właściciela: 6-cyfrowy kod z e-maila jako zapasowy sposób logowania.
- [ ] Włączenie kont (`NEXT_PUBLIC_ACCOUNTS_ENABLED=true`) dopiero razem z uprawnieniami planów i płatnościami (Faza 3), bo w Fazie 2 każde konto ma linki i logo bez limitu planu.

## RODO i umowy

- [ ] Okres przechowywania wpisów listy oczekujących i zdarzeń (decyzja z prawnikiem; ewentualnie zadanie czyszczące).
- [ ] Lista oczekujących bez podwójnego potwierdzenia (double opt-in): ktoś może zapisać cudzy adres. Decyzja właściciela i prawnika, np. link potwierdzający przed wysyłką o starcie.
- [ ] Usunięcie konta nie usuwa wpisu z listy oczekujących (osobna zgoda, niepowiązana z kontem). Decyzja, jak wypisać się z listy.
- [ ] Polityka prywatności opisuje konto: adres e-mail, nazwy klientów, liczby raportów i komentarze, logo, linki z licznikiem otwarć, eksport danych (JSON) i usunięcie konta.

- [ ] Umowy powierzenia przetwarzania (DPA) z dostawcami: Supabase, hosting (np. Vercel), Stripe.
- [ ] Projekt Supabase w regionie UE; hosting w UE (np. `fra1`).
- [ ] Polityka prywatności i regulamin napisane przez prawnika (miejsca `[DO UZUPEŁNIENIA przez prawnika]`), opisują rzeczywisty przepływ pliku, listę oczekujących i zdarzenia analityczne.

## Marka i prawo

- [ ] Wynik sprawdzenia znaku „Sedno” (UPRP, EUIPO) i dostępność domeny.
- [ ] Adres kontaktowy i dane firmy na /kontakt (dziś „[DO UZUPEŁNIENIA]”, a FAQ prowadzi tam „Napisz do nas”).
- [ ] Faktury: system zgodny z KSeF wybrany z księgową (Sedno nie wystawia faktur samo).
- [ ] Darmowy szablon gotowy i `NEXT_PUBLIC_TEMPLATE_URL` ustawione (inaczej strona pokazuje „Wkrótce”).

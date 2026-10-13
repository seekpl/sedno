/**
 * Co jest dostępne w bieżącej fazie (PROMPT.md §2.5: nie pokazuj jako dostępnej funkcji, której nie ma).
 * Teksty i przyciski zależne od tych flag zmieniają się same, gdy funkcja zacznie działać.
 */
export const features = {
  /**
   * Konta, linki do raportów, historia, logo (Faza 2). Włączane flagą NEXT_PUBLIC_ACCOUNTS_ENABLED=true
   * (i tylko z konfiguracją Supabase): publicznie wyłączone, dopóki właściciel nie zdecyduje
   * (docs/decisions.md, p. 94). Wartość zapada przy budowaniu.
   */
  accounts:
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED === 'true' &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  /** Płatności: Solo i pojedynczy raport (Faza 3). */
  payments: false,
} as const;

/**
 * Lista oczekujących działa od Fazy 1 (docs/decisions.md, p. 18), ale tylko z magazynem: Supabase
 * (adres + klucz serwisowy) albo plikowy magazyn deweloperski. Bez magazynu formularza nie pokazujemy.
 * Tylko na serwerze (zmienne bez NEXT_PUBLIC_ są niewidoczne w przeglądarce).
 */
export function waitlistEnabled(): boolean {
  const supabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  return supabase || Boolean(process.env.SEDNO_DEV_STORE_DIR);
}

/** Darmowy szablon jest „Dostępny” tylko z ustawionym adresem (PROMPT.md §12). */
export const templateUrl: string | null = process.env.NEXT_PUBLIC_TEMPLATE_URL?.trim() || null;

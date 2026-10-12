/**
 * Co jest dostępne w bieżącej fazie (PROMPT.md §2.5: nie pokazuj jako dostępnej funkcji, której nie ma).
 * Teksty i przyciski zależne od tych flag zmieniają się same, gdy funkcja zacznie działać.
 */
export const features = {
  /** Konta, linki do raportów, historia, logo (Faza 2). */
  accounts: false,
  /** Płatności: Solo i pojedynczy raport (Faza 3). */
  payments: false,
  /** Lista oczekujących na Studio (Faza 3). */
  waitlist: false,
} as const;

/** Darmowy szablon jest „Dostępny” tylko z ustawionym adresem (PROMPT.md §12). */
export const templateUrl: string | null = process.env.NEXT_PUBLIC_TEMPLATE_URL?.trim() || null;

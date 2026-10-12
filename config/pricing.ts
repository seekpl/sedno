/**
 * Ceny — jedyne źródło (PROMPT.md §4). Kwoty netto w PLN, VAT 23%.
 * Propozycja do testu popytu, nie decyzja (brand/docs/1-strategia.md). Nie wpisuj cen w treść.
 */
export const VAT_RATE = 0.23;
export const CURRENCY = 'PLN';

export type PlanId = 'free' | 'solo' | 'studio';

export const PLANS: Record<PlanId, { name: string; netMonthly: number; clients: number }> = {
  free: { name: 'Na start', netMonthly: 0, clients: 1 },
  solo: { name: 'Solo', netMonthly: 49, clients: 10 },
  studio: { name: 'Studio', netMonthly: 99, clients: 25 },
};

/** Pojedynczy raport bez abonamentu. */
export const SINGLE_REPORT = { netPrice: 9 };

/** Kwota brutto, zaokrąglona do grosza. */
export function gross(net: number): number {
  return Math.round(net * (1 + VAT_RATE) * 100) / 100;
}

/** „49 zł”, „0 zł”, „11,07 zł” — pełne złote bez groszy. */
export function formatPrice(amount: number): string {
  const whole = Number.isInteger(amount);
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(amount);
}

'use server';

/**
 * Zapis zdarzenia testu popytu (PROMPT.md §16). Wejście sprawdza ścisły schemat z lib/analytics/events.ts:
 * tylko znane nazwy, tylko wymienione pola, liczby i krótkie wyliczenia — treść pliku ani raportu nie ma
 * gdzie się zmieścić. Nieprawidłowe wejście: { ok: false } i nic nie zapisujemy.
 * Limity: 120 na minutę na adres IP (IPv6: sieć /64) i 120 na minutę na identyfikator sesji.
 * Akcja nigdy nie rzuca wyjątku.
 */
import { EVENT_SCHEMAS, eventInputSchema, type EventName } from '@/lib/analytics/events';
import { clientRateLimitKey } from '@/lib/server/client-ip';
import { rateLimit } from '@/lib/server/rate-limit';
import { getStore, StoreError } from '@/lib/server/store';

const LIMIT = 120;
const WINDOW_MS = 60_000;
/**
 * Dokładnie to, co tworzy lib/analytics/client.ts (16 bajtów → 22 znaki base64url). Węższe niż anonIdSchema
 * (16–32 znaki), żeby identyfikator nie mógł nieść dłuższego tekstu, np. znacznika z testu prywatności.
 */
const ANON_ID = /^[A-Za-z0-9_-]{22}$/;

/**
 * Zdarzenia, które zapisuje wyłącznie serwer: waitlist_joined (joinWaitlist), signup_completed (auth,
 * Faza 2), purchase_completed (webhook Stripe, Faza 3). Przeglądarka nie może ich podrobić ani zdublować —
 * od nich zależą progi decyzji właściciela (PROMPT.md §16).
 */
const SERVER_ONLY_EVENTS = [
  'waitlist_joined',
  'signup_completed',
  'purchase_completed',
  // Faza 2: link tworzy i otwiera serwer (Server Action, strona /r/[token]) — lib/server/server-events.ts.
  'link_created',
  'link_opened',
] as const satisfies readonly EventName[];

export type ServerOnlyEventName = (typeof SERVER_ONLY_EVENTS)[number];

function isServerOnly(name: EventName): name is ServerOnlyEventName {
  return (SERVER_ONLY_EVENTS as readonly EventName[]).includes(name);
}

export async function recordEvent(input: unknown): Promise<{ ok: boolean }> {
  try {
    // Limit na IP przed walidacją: liczą się też nieprawidłowe próby.
    const ip = await clientRateLimitKey();
    if (!rateLimit(`events:ip:${ip}`, LIMIT, WINDOW_MS)) return { ok: false };

    const parsed = eventInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false };
    const { name, anonId } = parsed.data;
    if (!ANON_ID.test(anonId) || isServerOnly(name)) return { ok: false };

    // Zapisujemy wynik ścisłego schematu, nie surowe wejście.
    const props = EVENT_SCHEMAS[name].safeParse(parsed.data.props);
    if (!props.success) return { ok: false };

    if (!rateLimit(`events:anon:${anonId}`, LIMIT, WINDOW_MS)) return { ok: false };

    const store = getStore();
    if (!store) return { ok: false };
    await store.insertEvent({ name, anonId, ownerId: null, props: props.data });
    return { ok: true };
  } catch (error) {
    // Bez właściwości i identyfikatorów: tylko ogólny komunikat (StoreError niesie tabelę i kod).
    console.error(
      error instanceof StoreError ? `[sedno] ${error.message}` : '[sedno] Zdarzenie nie zostało zapisane.',
    );
    return { ok: false };
  }
}

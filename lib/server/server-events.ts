import 'server-only';
import { EVENT_SCHEMAS, type EventName, type EventProps } from '@/lib/analytics/events';
import { getStore } from '@/lib/server/store';

/**
 * Zdarzenie zapisywane przez serwer (link_created, link_opened, signup_completed…): ten sam ścisły schemat
 * co w przeglądarce, z opcjonalnym właścicielem. Nigdy nie rzuca i nie loguje treści — analityka nie może
 * zepsuć akcji użytkownika.
 */
export async function recordServerEvent<N extends EventName>(
  name: N,
  props: EventProps<N>,
  ownerId: string | null = null,
): Promise<void> {
  try {
    const parsed = EVENT_SCHEMAS[name].safeParse(props);
    if (!parsed.success) return;
    await getStore()?.insertEvent({
      name,
      anonId: null,
      ownerId,
      props: parsed.data as Record<string, unknown>,
    });
  } catch {
    // Brak zapisu zdarzenia nie przerywa działania aplikacji.
  }
}

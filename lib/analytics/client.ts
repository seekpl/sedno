/**
 * Analityka testu popytu w przeglądarce (PROMPT.md §16). Bez cookies i zewnętrznych narzędzi.
 *
 * - track() sprawdza właściwości ścisłym schematem (lib/analytics/events.ts) jeszcze przed wysłaniem;
 *   nieprawidłowe zdarzenie znika po cichu (w trybie deweloperskim ostrzeżenie bez właściwości).
 * - Schematy (zod) ładują się dynamicznie przy pierwszym track(), a nie z modułem: getAnonId() i formularz
 *   listy oczekujących na stronie głównej nie ciągną zod do jej JavaScriptu (PROMPT.md §15: < 80 KB gzip).
 * - Identyfikator sesji: 16 losowych bajtów (CSPRNG) jako base64url, w sessionStorage pod „sedno.anonId”.
 *   Gdy sessionStorage nie działa (tryb prywatny, blokada), identyfikator żyje tylko w pamięci strony.
 * - Wysyłka przez Server Action recordEvent „wystrzel i zapomnij”: nigdy nie blokuje ani nie psuje interfejsu.
 * - Zdarzeń zapisywanych wyłącznie przez serwer (np. waitlist_joined) nie da się tu wywołać.
 */
import { recordEvent, type ServerOnlyEventName } from '@/app/actions/events';
import type * as Events from './events';
import type { EventName, EventProps } from './events';

export const ANON_ID_KEY = 'sedno.anonId';

const ANON_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** Zdarzenia, które może wysłać przeglądarka. */
export type ClientEventName = Exclude<EventName, ServerOnlyEventName>;

let memoryId: string | null = null;

/** 16 bajtów z crypto.getRandomValues → 22 znaki base64url (bez dopełnienia). */
function randomAnonId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Identyfikator sesji: ten sam do zamknięcia karty. Stabilny między wywołaniami. */
export function getAnonId(): string {
  try {
    const stored = window.sessionStorage.getItem(ANON_ID_KEY);
    if (stored && ANON_ID_PATTERN.test(stored)) {
      memoryId = stored;
      return stored;
    }
    const id = memoryId ?? randomAnonId();
    memoryId = id;
    window.sessionStorage.setItem(ANON_ID_KEY, id);
    return id;
  } catch {
    memoryId ??= randomAnonId();
    return memoryId;
  }
}

let schemas: Promise<typeof Events> | null = null;

/** Schematy ładowane raz, przy pierwszym zdarzeniu. Nieudane ładowanie można powtórzyć później. */
function loadSchemas(): Promise<typeof Events> {
  schemas ??= import('./events').catch((error: unknown) => {
    schemas = null;
    throw error;
  });
  return schemas;
}

async function send(name: string, props: unknown): Promise<void> {
  const { EVENT_SCHEMAS } = await loadSchemas();
  const schema = Object.hasOwn(EVENT_SCHEMAS, name) ? EVENT_SCHEMAS[name as EventName] : undefined;
  const parsed = schema?.safeParse(props);
  if (!parsed?.success) {
    if (schema && process.env.NODE_ENV === 'development') {
      console.warn(`[sedno] Zdarzenie „${name}” odrzucone: właściwości nie pasują do schematu.`);
    }
    return;
  }
  await recordEvent({ name, anonId: getAnonId(), props: parsed.data });
}

/** Zapisuje zdarzenie. Nie zwraca obietnicy: wywołujący nigdy na nie nie czeka. */
export function track<N extends ClientEventName>(name: N, props: EventProps<N>): void {
  try {
    if (typeof window === 'undefined') return;
    void send(name, props).catch(() => undefined);
  } catch {
    // Analityka nigdy nie psuje interfejsu.
  }
}

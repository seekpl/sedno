/**
 * Limit zapytań z przesuwanym oknem (PROMPT.md §15: limity zapisu zdarzeń i listy oczekujących).
 *
 * Pamięć jednego procesu: przy kilku instancjach serwera każda liczy osobno, a restart zeruje liczniki.
 * Przeniesienie do trwałego magazynu jest w docs/launch-checklist.md (Bezpieczeństwo).
 *
 * Pamięć jest ograniczona: na klucz najwyżej `limit` znaczników czasu, a liczba kluczy ma górną granicę.
 * Po jej przekroczeniu najpierw znikają klucze z wygasłym oknem, potem najdawniej używane.
 * Każde miejsce (prefiks klucza) ma własną pamięć i własną granicę liczby kluczy.
 * Klucze (np. adres IP) nie trafiają do logów ani bazy.
 */

type Bucket = {
  /** Znaczniki czasu udanych prób, rosnąco; najwyżej `limit` sztuk. */
  hits: number[];
  /** Po tej chwili okno jest puste i klucz można usunąć. */
  expiresAt: number;
};

export type RateLimiter = {
  /** true — próba mieści się w limicie (i zostaje policzona); false — limit przekroczony. */
  check(key: string, limit: number, windowMs: number, now?: number): boolean;
  /** Liczba śledzonych kluczy (testy, diagnostyka). */
  size(): number;
  clear(): void;
};

export const DEFAULT_MAX_KEYS = 5_000;

export function createRateLimiter(maxKeys = DEFAULT_MAX_KEYS): RateLimiter {
  // Map zachowuje kolejność wstawiania: przy każdym użyciu klucz trafia na koniec (najświeższy).
  const buckets = new Map<string, Bucket>();

  function evict(now: number) {
    for (const [key, bucket] of buckets) {
      if (bucket.expiresAt <= now) buckets.delete(key);
    }
    // Zostawiamy zapas (90%), żeby nie przeglądać całej mapy przy każdym kolejnym kluczu.
    const target = Math.floor(maxKeys * 0.9);
    for (const key of buckets.keys()) {
      if (buckets.size <= target) break;
      buckets.delete(key);
    }
  }

  return {
    check(key, limit, windowMs, now = Date.now()) {
      if (limit <= 0) return false;
      const since = now - windowMs;
      const previous = buckets.get(key);
      const hits = previous ? previous.hits.filter((t) => t > since) : [];
      buckets.delete(key);

      const allowed = hits.length < limit;
      if (allowed) hits.push(now);
      const last = hits[hits.length - 1];
      if (last !== undefined) buckets.set(key, { hits, expiresAt: last + windowMs });

      if (buckets.size > maxKeys) evict(now);
      return allowed;
    },
    size: () => buckets.size,
    clear: () => buckets.clear(),
  };
}

/**
 * Osobna pamięć dla każdego miejsca (część klucza przed pierwszym „:”, np. `events`, `waitlist`).
 * Klucze zdarzeń zawierają identyfikator sesji wybierany przez klienta — gdyby wszystko było w jednej
 * mapie, zalew zdarzeń z losowymi identyfikatorami wypychałby liczniki listy oczekujących i zerował jej limit.
 * Miejsc jest tyle, ile prefiksów w kodzie.
 */
const shared = new Map<string, RateLimiter>();

/**
 * Wspólny limiter procesu. Klucze z prefiksem miejsca, np. `events:ip:1.2.3.4`, `waitlist:ip:…`.
 * Zwraca true, gdy próba mieści się w limicie `limit` na `windowMs` milisekund.
 */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const colon = key.indexOf(':');
  const space = colon === -1 ? '' : key.slice(0, colon);
  let limiter = shared.get(space);
  if (!limiter) {
    limiter = createRateLimiter();
    shared.set(space, limiter);
  }
  return limiter.check(key, limit, windowMs, now);
}

/** Tylko dla testów: zeruje wspólny limiter. */
export function resetRateLimits(): void {
  shared.clear();
}

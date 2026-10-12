import { headers } from 'next/headers';

/**
 * Adres IP klienta — wyłącznie jako klucz limitu zapytań (lib/server/rate-limit.ts).
 * Nigdy go nie zapisujemy w bazie ani w logach (polityka prywatności: „Dane techniczne”).
 *
 * Kolejność: pierwszy adres z X-Forwarded-For, potem X-Real-IP, w ostateczności „unknown”
 * (wszystkie takie zapytania dzielą jeden limit). Nagłówki ustawia platforma hostingowa; za proxy,
 * które tylko dopisuje adres do X-Forwarded-For, pierwszy adres podaje klient — dlatego zdarzenia mają
 * też osobny limit na identyfikator sesji.
 *
 * Adres jest sprowadzany do jednej postaci: IPv4 bez portu, IPv6 w pełnej formie małymi literami,
 * IPv4 zapisany jako IPv6 (::ffff:a.b.c.d) jako zwykły IPv4. Wartość, która nie jest adresem, pomijamy.
 */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    const forwarded = h.get('x-forwarded-for')?.split(',')[0];
    return normalizeIp(forwarded) ?? normalizeIp(h.get('x-real-ip')) ?? 'unknown';
  } catch {
    // Poza kontekstem żądania (np. wywołanie w teście bez nagłówków).
    return 'unknown';
  }
}

/**
 * Klucz limitu dla adresu: IPv4 bez zmian, IPv6 skrócony do sieci /64. Jedno łącze (telefon, router
 * domowy) dostaje całą sieć /64 i może dowolnie zmieniać adres w jej obrębie — pełny adres IPv6
 * pozwalałby obejść limit.
 */
export function rateLimitKeyForIp(ip: string): string {
  const groups = ip.includes(':') ? ipv6Groups(ip) : null;
  return groups ? `${groups.slice(0, 4).join(':')}::/64` : ip;
}

/** Klucz limitu dla bieżącego żądania (clientIp + rateLimitKeyForIp). */
export async function clientRateLimitKey(): Promise<string> {
  return rateLimitKeyForIp(await clientIp());
}

/** Postać jednolita albo null, gdy wartość nie jest adresem IPv4/IPv6 (z ewentualnym portem). */
export function normalizeIp(value: string | null | undefined): string | null {
  const v = value?.trim().toLowerCase();
  if (!v || v.length > 64) return null;

  // IPv4, opcjonalnie z portem („203.0.113.7:51234” — port zmienia się przy każdym połączeniu).
  const v4 = /^(\d{1,3}(?:\.\d{1,3}){3})(?::\d{1,5})?$/.exec(v);
  if (v4?.[1]) return ipv4(v4[1]);

  // IPv6, opcjonalnie w nawiasach z portem („[2001:db8::1]:443”).
  const bracketed = /^\[([^\]]+)\](?::\d{1,5})?$/.exec(v);
  const groups = ipv6Groups(bracketed?.[1] ?? v);
  if (!groups) return null;
  const mapped = groups.slice(0, 5).every((g) => g === '0') && groups[5] === 'ffff';
  if (mapped) {
    const [hi = 0, lo = 0] = groups.slice(6).map((g) => parseInt(g, 16));
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return groups.join(':');
}

function ipv4(value: string): string | null {
  const parts = value.split('.').map(Number);
  return parts.every((p) => p <= 255) ? parts.join('.') : null;
}

/** Osiem grup IPv6 (bez zer wiodących) albo null. Obsługuje „::” i końcówkę w zapisie IPv4. */
function ipv6Groups(value: string): string[] | null {
  let v = value;
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(v);
  if (tail?.[1]) {
    const dotted = ipv4(tail[1]);
    if (!dotted || !v.endsWith(`:${tail[1]}`)) return null;
    const [a = 0, b = 0, c = 0, d = 0] = dotted.split('.').map(Number);
    v = `${v.slice(0, -tail[1].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const halves = v.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves[1] ? halves[1].split(':') : [];
  let groups: string[];
  if (halves.length === 1) {
    groups = head;
  } else {
    const missing = 8 - head.length - rest.length;
    if (missing < 1) return null;
    groups = [...head, ...Array.from({ length: missing }, () => '0'), ...rest];
  }
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => g.replace(/^0+(?=.)/, ''));
}

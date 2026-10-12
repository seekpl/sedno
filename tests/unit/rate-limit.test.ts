import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MAX_KEYS, createRateLimiter, rateLimit, resetRateLimits } from '@/lib/server/rate-limit';

const h = vi.hoisted(() => ({ headers: {} as Record<string, string>, fail: false }));
vi.mock('next/headers', () => ({
  headers: async () => {
    if (h.fail) throw new Error('poza żądaniem');
    return new Headers(h.headers);
  },
}));

const { clientIp, clientRateLimitKey, normalizeIp, rateLimitKeyForIp } =
  await import('@/lib/server/client-ip');

afterEach(resetRateLimits);

describe('limit zapytań (przesuwane okno)', () => {
  it('przepuszcza do limitu, potem odrzuca', () => {
    const limiter = createRateLimiter();
    const results = Array.from({ length: 5 }, () => limiter.check('k', 3, 1000, 0));
    expect(results).toEqual([true, true, true, false, false]);
  });

  it('okno się przesuwa: stare próby wygasają pojedynczo', () => {
    const limiter = createRateLimiter();
    expect(limiter.check('k', 2, 1000, 0)).toBe(true);
    expect(limiter.check('k', 2, 1000, 600)).toBe(true);
    expect(limiter.check('k', 2, 1000, 900)).toBe(false);
    // Próba z chwili 0 wypada z okna po 1000 ms, ta z 600 jeszcze nie.
    expect(limiter.check('k', 2, 1000, 1001)).toBe(true);
    expect(limiter.check('k', 2, 1000, 1002)).toBe(false);
    expect(limiter.check('k', 2, 1000, 1601)).toBe(true);
  });

  it('odrzucone próby nie przedłużają blokady', () => {
    const limiter = createRateLimiter();
    expect(limiter.check('k', 1, 1000, 0)).toBe(true);
    for (let t = 100; t < 1000; t += 100) expect(limiter.check('k', 1, 1000, t)).toBe(false);
    expect(limiter.check('k', 1, 1000, 1000)).toBe(true);
  });

  it('klucze liczą się osobno', () => {
    const limiter = createRateLimiter();
    expect(limiter.check('a', 1, 1000, 0)).toBe(true);
    expect(limiter.check('a', 1, 1000, 0)).toBe(false);
    expect(limiter.check('b', 1, 1000, 0)).toBe(true);
  });

  it('limit 0 zawsze odrzuca', () => {
    expect(createRateLimiter().check('k', 0, 1000, 0)).toBe(false);
  });

  it('pamięć ograniczona: najpierw usuwa wygasłe klucze', () => {
    const limiter = createRateLimiter(10);
    for (let i = 0; i < 10; i++) limiter.check(`old-${i}`, 5, 100, 0);
    expect(limiter.size()).toBe(10);
    limiter.check('fresh', 5, 100, 1000);
    expect(limiter.size()).toBe(1);
  });

  it('pamięć ograniczona: przy samych aktywnych kluczach usuwa najdawniej używane', () => {
    const limiter = createRateLimiter(10);
    for (let i = 0; i < 10; i++) limiter.check(`k-${i}`, 5, 60_000, i);
    // k-0 użyty ponownie — staje się najświeższy.
    limiter.check('k-0', 5, 60_000, 20);
    limiter.check('new', 5, 60_000, 21);
    expect(limiter.size()).toBeLessThanOrEqual(10);
    // k-0 przetrwał, k-1 (najdawniej używany) został usunięty i zaczyna od zera.
    expect(limiter.check('k-0', 2, 60_000, 22)).toBe(false);
    expect(limiter.check('k-1', 1, 60_000, 22)).toBe(true);
  });

  it('nie trzyma więcej znaczników niż limit na klucz', () => {
    const limiter = createRateLimiter();
    for (let i = 0; i < 10_000; i++) limiter.check('k', 3, 60_000, i);
    expect(limiter.size()).toBe(1);
    expect(limiter.check('k', 3, 60_000, 10_000)).toBe(false);
  });

  it('wspólny limiter procesu i reset dla testów', () => {
    expect(rateLimit('shared', 1, 1000, 0)).toBe(true);
    expect(rateLimit('shared', 1, 1000, 1)).toBe(false);
    resetRateLimits();
    expect(rateLimit('shared', 1, 1000, 2)).toBe(true);
  });

  it('domyślny czas to Date.now()', () => {
    expect(rateLimit('now', 1, 60_000)).toBe(true);
    expect(rateLimit('now', 1, 60_000)).toBe(false);
  });
});

describe('limit zapytań — osobne miejsca', () => {
  it('zalew kluczy zdarzeń nie wypycha licznika listy oczekujących', () => {
    expect(rateLimit('waitlist:ip:203.0.113.7', 1, 600_000, 0)).toBe(true);
    // Identyfikatory sesji wybiera klient: więcej kluczy niż granica pamięci jednego miejsca.
    for (let i = 0; i <= DEFAULT_MAX_KEYS + 10; i++) rateLimit(`events:anon:${i}`, 120, 60_000, 1);
    // Licznik listy przetrwał: druga próba z tego adresu dalej jest odrzucana.
    expect(rateLimit('waitlist:ip:203.0.113.7', 1, 600_000, 2)).toBe(false);
  });
});

describe('adres klienta jako klucz limitu (lib/server/client-ip.ts)', () => {
  afterEach(() => {
    h.headers = {};
    h.fail = false;
  });

  it('pierwszy adres z X-Forwarded-For (adres klienta, nie proxy)', async () => {
    h.headers = { 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.1, 10.0.0.2', 'x-real-ip': '198.51.100.1' };
    expect(await clientIp()).toBe('203.0.113.7');
  });

  it('bez X-Forwarded-For (albo z wartością, która nie jest adresem) — X-Real-IP, potem „unknown”', async () => {
    h.headers = { 'x-real-ip': '198.51.100.1' };
    expect(await clientIp()).toBe('198.51.100.1');
    h.headers = { 'x-forwarded-for': 'unknown, 10.0.0.1', 'x-real-ip': '198.51.100.1' };
    expect(await clientIp()).toBe('198.51.100.1');
    h.headers = { 'x-forwarded-for': '<script>' };
    expect(await clientIp()).toBe('unknown');
    h.headers = {};
    expect(await clientIp()).toBe('unknown');
    h.fail = true;
    expect(await clientIp()).toBe('unknown');
  });

  it('port nie zmienia klucza (inaczej każde połączenie miałoby własny limit)', () => {
    expect(normalizeIp('203.0.113.7:51234')).toBe('203.0.113.7');
    expect(normalizeIp('203.0.113.7:51235')).toBe('203.0.113.7');
    expect(normalizeIp('[2001:db8::1]:443')).toBe('2001:db8:0:0:0:0:0:1');
  });

  it('IPv6 w jednej postaci; IPv4 zapisany jako IPv6 to zwykły IPv4', () => {
    expect(normalizeIp('2001:DB8:0000::0001')).toBe('2001:db8:0:0:0:0:0:1');
    expect(normalizeIp('::1')).toBe('0:0:0:0:0:0:0:1');
    expect(normalizeIp('::')).toBe('0:0:0:0:0:0:0:0');
    expect(normalizeIp('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeIp('::ffff:cb00:7107')).toBe('203.0.113.7');
    expect(normalizeIp('1:2:3:4:5:6:7:8')).toBe('1:2:3:4:5:6:7:8');
  });

  it('wartości, które nie są adresem, są odrzucane', () => {
    for (const bad of [
      '',
      'unknown',
      '999.1.1.1',
      '1.2.3',
      '1:2:3:4:5:6:7',
      '1:2:3:4:5:6:7:8:9',
      '1::2::3',
      '1:2:3:4:5:6:7:8::',
      '12345::1',
      'fe80::1%eth0',
      'ffff:1.2.3.4',
      `${'1'.repeat(70)}`,
      null,
      undefined,
    ]) {
      expect(normalizeIp(bad)).toBeNull();
    }
  });

  it('klucz limitu: IPv4 bez zmian, IPv6 — cała sieć /64 (zmiana adresu w niej nie omija limitu)', async () => {
    expect(rateLimitKeyForIp('203.0.113.7')).toBe('203.0.113.7');
    expect(rateLimitKeyForIp('unknown')).toBe('unknown');
    const a = rateLimitKeyForIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
    const b = rateLimitKeyForIp('2001:db8:1:2::9');
    expect(a).toBe('2001:db8:1:2::/64');
    expect(b).toBe(a);
    expect(rateLimitKeyForIp('2001:db8:1:3::9')).not.toBe(a);

    h.headers = { 'x-forwarded-for': '2001:db8:1:2:aaaa::1' };
    expect(await clientRateLimitKey()).toBe('2001:db8:1:2::/64');
    h.headers = { 'x-forwarded-for': '203.0.113.7:4444' };
    expect(await clientRateLimitKey()).toBe('203.0.113.7');
  });
});

import { describe, expect, it } from 'vitest';
import { buildCsp, cspModeFor, createNonce } from '@/lib/security/csp';

const directive = (csp: string, name: string) =>
  csp
    .split('; ')
    .find((d) => d.startsWith(`${name} `))
    ?.slice(name.length + 1);

describe('CSP według tras (docs/decisions.md, p. 16)', () => {
  it.each([
    ['/', 'static'],
    ['/przyklad', 'static'],
    ['/poradniki/jak-zrobic-raport', 'static'],
    ['/prywatnosc', 'static'],
    ['/nowy', 'nonce'],
    ['/app/klienci', 'nonce'],
    ['/app', 'nonce'],
    ['/r/abc', 'nonce'],
    ['/logowanie', 'nonce'],
    ['/nowyx', 'static'],
    ['/aplikacja', 'static'],
  ] as const)('%s → %s', (path, mode) => {
    expect(cspModeFor(path)).toBe(mode);
  });

  it('strony marketingowe: self + unsafe-inline, bez unsafe-eval w produkcji', () => {
    const csp = buildCsp({ pathname: '/', dev: false });
    expect(directive(csp, 'script-src')).toBe("'self' 'unsafe-inline'");
    expect(csp).not.toContain('unsafe-eval');
  });

  it('/nowy: nonce + strict-dynamic, bez unsafe-inline w script-src, connect-src tylko self', () => {
    const csp = buildCsp({
      pathname: '/nowy',
      nonce: 'abc',
      dev: false,
      supabaseUrl: 'https://x.supabase.co',
    });
    expect(directive(csp, 'script-src')).toBe("'nonce-abc' 'strict-dynamic'");
    expect(directive(csp, 'connect-src')).toBe("'self'");
  });

  it('/app: Supabase w connect-src', () => {
    const csp = buildCsp({
      pathname: '/app/klienci',
      nonce: 'abc',
      dev: false,
      supabaseUrl: 'https://x.supabase.co/rest',
    });
    expect(directive(csp, 'connect-src')).toBe("'self' https://x.supabase.co");
  });

  it('wspólne dyrektywy na każdej trasie', () => {
    for (const [pathname, nonce] of [
      ['/', undefined],
      ['/nowy', 'n'],
    ] as const) {
      const csp = buildCsp({ pathname, nonce, dev: false });
      expect(directive(csp, 'default-src')).toBe("'self'");
      expect(directive(csp, 'img-src')).toBe("'self' data: blob:");
      expect(directive(csp, 'worker-src')).toBe("'self' blob:");
      expect(directive(csp, 'object-src')).toBe("'none'");
      expect(directive(csp, 'base-uri')).toBe("'none'");
      expect(directive(csp, 'form-action')).toBe("'self'");
      expect(directive(csp, 'frame-ancestors')).toBe("'none'");
    }
  });

  it('trasa z nonce bez nonce to błąd', () => {
    expect(() => buildCsp({ pathname: '/nowy', dev: false })).toThrow();
  });

  it('nonce ma 128 bitów i jest za każdym razem inny', () => {
    const a = createNonce();
    const b = createNonce();
    expect(atob(a)).toHaveLength(16);
    expect(a).not.toBe(b);
  });
});

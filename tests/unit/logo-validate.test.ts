import { describe, expect, it } from 'vitest';
import { checkLogo, LOGO_MAX_BYTES } from '@/lib/logo/validate';

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0]);

describe('logo: PNG, JPEG, WebP do 2 MB, bez SVG', () => {
  it('rozpoznaje formaty po sygnaturze', () => {
    expect(checkLogo(png)).toEqual({ ok: true, ext: 'png', contentType: 'image/png' });
    expect(checkLogo(jpg)).toEqual({ ok: true, ext: 'jpg', contentType: 'image/jpeg' });
    expect(checkLogo(webp)).toEqual({ ok: true, ext: 'webp', contentType: 'image/webp' });
  });

  it('odrzuca SVG, GIF, pusty plik i za duży', () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    expect(checkLogo(svg)).toEqual({ ok: false, reason: 'unsupported' });
    expect(checkLogo(new TextEncoder().encode('GIF89a'))).toEqual({ ok: false, reason: 'unsupported' });
    expect(checkLogo(new Uint8Array())).toEqual({ ok: false, reason: 'empty' });
    const big = new Uint8Array(LOGO_MAX_BYTES + 1);
    big.set(png);
    expect(checkLogo(big)).toEqual({ ok: false, reason: 'too-big' });
  });

  it('nazwa pliku i deklarowany typ nie mają znaczenia (RIFF bez WEBP to nie WebP)', () => {
    expect(checkLogo(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toEqual({
      ok: false,
      reason: 'unsupported',
    });
  });
});

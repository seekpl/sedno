import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { settings } from '@/lib/copy/settings';
import { checkLogo, LOGO_MAX_BYTES, LOGO_MAX_SIDE, logoSize } from '@/lib/logo/validate';

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

// Nagłówki z wymiarami, jak w prawdziwych plikach (bez danych obrazu — przeglądarka czyta je przed dekodowaniem).
const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16be = (n: number) => [(n >> 8) & 255, n & 255];
const u16le = (n: number) => [n & 255, (n >> 8) & 255];
const u24le = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
const riff = (chunk: string, body: number[]) =>
  Uint8Array.from([
    ...[0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
    ...[...chunk].map((c) => c.charCodeAt(0)),
    ...[0, 0, 0, 0],
    ...body,
  ]);

const pngOf = (w: number, h: number) =>
  Uint8Array.from([
    ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ...u32be(13),
    ...[0x49, 0x48, 0x44, 0x52],
    ...u32be(w),
    ...u32be(h),
    ...[8, 6, 0, 0, 0],
  ]);
// SOI, APP0 (16 B), DQT-podobny segment, SOF2 (progresywny) z wysokością i szerokością.
const jpgOf = (w: number, h: number) =>
  Uint8Array.from([
    ...[0xff, 0xd8],
    ...[0xff, 0xe0, ...u16be(16), 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0],
    ...[0xff, 0xdb, ...u16be(4), 0, 0],
    ...[0xff, 0xff, 0xc2, ...u16be(17), 8, ...u16be(h), ...u16be(w), 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1],
  ]);
const vp8xOf = (w: number, h: number) => riff('VP8X', [0, 0, 0, 0, ...u24le(w - 1), ...u24le(h - 1)]);
const vp8lOf = (w: number, h: number) => {
  const bits = (w - 1) | ((h - 1) << 14);
  return riff('VP8L', [0x2f, bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >>> 24) & 255]);
};
const vp8Of = (w: number, h: number) => riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(w), ...u16le(h)]);

describe('logo: wymiary z nagłówka, najwyżej 4000 px na bok', () => {
  it('czyta wymiary PNG, JPEG (też progresywnego) i trzech odmian WebP', () => {
    expect(logoSize(pngOf(1200, 300), { ext: 'png', contentType: 'image/png' })).toEqual({
      width: 1200,
      height: 300,
    });
    expect(logoSize(jpgOf(800, 200), { ext: 'jpg', contentType: 'image/jpeg' })).toEqual({
      width: 800,
      height: 200,
    });
    const webpKind = { ext: 'webp', contentType: 'image/webp' } as const;
    expect(logoSize(vp8xOf(5000, 120), webpKind)).toEqual({ width: 5000, height: 120 });
    expect(logoSize(vp8lOf(640, 160), webpKind)).toEqual({ width: 640, height: 160 });
    expect(logoSize(vp8Of(320, 80), webpKind)).toEqual({ width: 320, height: 80 });
  });

  it('prawdziwy plik PNG z public/', () => {
    const bytes = new Uint8Array(readFileSync(new URL('../../public/icon-192.png', import.meta.url)));
    expect(logoSize(bytes, { ext: 'png', contentType: 'image/png' })).toEqual({ width: 192, height: 192 });
    expect(checkLogo(bytes)).toMatchObject({ ok: true, ext: 'png' });
  });

  it('przyjmuje 4000 px, odrzuca 4001 px w każdym formacie i na każdym boku', () => {
    expect(checkLogo(pngOf(LOGO_MAX_SIDE, LOGO_MAX_SIDE))).toMatchObject({ ok: true });
    for (const big of [
      pngOf(LOGO_MAX_SIDE + 1, 10),
      pngOf(10, 20000),
      jpgOf(LOGO_MAX_SIDE + 1, 10),
      vp8xOf(10, LOGO_MAX_SIDE + 1),
      vp8lOf(LOGO_MAX_SIDE + 1, 10),
      vp8Of(10, LOGO_MAX_SIDE + 1),
    ]) {
      expect(checkLogo(big)).toEqual({ ok: false, reason: 'too-large-image' });
    }
  });

  it('niepełny nagłówek nie blokuje (taki plik i tak się nie wyświetli)', () => {
    expect(checkLogo(png)).toMatchObject({ ok: true });
    expect(logoSize(png, { ext: 'png', contentType: 'image/png' })).toBeNull();
    expect(logoSize(jpg, { ext: 'jpg', contentType: 'image/jpeg' })).toBeNull();
  });

  it('tekst błędu podaje ten sam limit', () => {
    expect(settings.logo.errors.tooLargeImage.title).toContain(`${LOGO_MAX_SIDE} px`);
  });
});

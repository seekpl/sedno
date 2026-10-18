/**
 * Logo autora do PDF (lib/pdf/logo.ts): tylko ścieżka z tej samej domeny, rodzaj po sygnaturze pliku,
 * w przeglądarce przerysowanie do PNG w polu 640 × 160 px (WebP, którego react-pdf nie czyta), bez płótna
 * PNG i JPEG wprost. Każdy błąd daje null — PDF powstaje wtedy bez logo.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSameOriginPath, loadPdfLogo, PDF_LOGO_MAX, sniffLogo } from '@/lib/pdf/logo';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 7]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

function fetcher(body: Uint8Array<ArrayBuffer> | null, status = 200) {
  return vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch &
    ReturnType<typeof vi.fn>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sniffLogo i isSameOriginPath', () => {
  it('rozpoznaje PNG, JPEG i WebP po sygnaturze; SVG i inne pliki to null', () => {
    expect(sniffLogo(PNG)).toBe('png');
    expect(sniffLogo(JPEG)).toBe('jpeg');
    expect(sniffLogo(WEBP)).toBe('webp');
    expect(sniffLogo(SVG)).toBeNull();
    expect(sniffLogo(new Uint8Array())).toBeNull();
  });

  it('przepuszcza tylko ścieżki z tej samej domeny', () => {
    expect(isSameOriginPath('/app/logo')).toBe(true);
    expect(isSameOriginPath('/r/AbCdEfGhIjKlMnOpQrStUv/logo')).toBe(true);
    expect(isSameOriginPath('//evil.example/logo.png')).toBe(false);
    expect(isSameOriginPath('/\\evil.example')).toBe(false);
    expect(isSameOriginPath('https://evil.example/logo.png')).toBe(false);
    expect(isSameOriginPath('data:image/png;base64,AAAA')).toBe(false);
    expect(isSameOriginPath('javascript:alert(1)')).toBe(false);
  });
});

describe('loadPdfLogo bez płótna (poza przeglądarką)', () => {
  it('PNG i JPEG jako adres data: z typem z sygnatury', async () => {
    const png = await loadPdfLogo('/app/logo', fetcher(PNG));
    expect(png).toBe(`data:image/png;base64,${Buffer.from(PNG).toString('base64')}`);
    const jpeg = await loadPdfLogo('/app/logo', fetcher(JPEG));
    expect(jpeg).toBe(`data:image/jpeg;base64,${Buffer.from(JPEG).toString('base64')}`);
  });

  it('pobiera z ciasteczkami tej domeny i bez pamięci podręcznej', async () => {
    const f = fetcher(PNG);
    await loadPdfLogo('/app/logo', f);
    expect(f).toHaveBeenCalledWith('/app/logo', { credentials: 'same-origin', cache: 'no-store' });
  });

  it('WebP bez płótna, SVG, błąd HTTP, błąd sieci i obcy adres: null', async () => {
    expect(await loadPdfLogo('/app/logo', fetcher(WEBP))).toBeNull();
    expect(await loadPdfLogo('/app/logo', fetcher(SVG))).toBeNull();
    expect(await loadPdfLogo('/app/logo', fetcher(null, 404))).toBeNull();
    const failing = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await loadPdfLogo('/app/logo', failing)).toBeNull();
    const foreign = fetcher(PNG);
    expect(await loadPdfLogo('https://evil.example/logo.png', foreign)).toBeNull();
    expect(foreign).not.toHaveBeenCalled();
  });
});

describe('loadPdfLogo w przeglądarce (płótno)', () => {
  function stubCanvas(size: { width: number; height: number }, dataUrl = 'data:image/png;base64,QUJD') {
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toDataURL: vi.fn(() => dataUrl),
    };
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ ...size, close })),
    );
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
    return { canvas, drawImage, close };
  }

  it('przerysowuje WebP do PNG zmniejszonego do pola 640 × 160 px', async () => {
    const { canvas, drawImage, close } = stubCanvas({ width: 2560, height: 320 });
    expect(await loadPdfLogo('/app/logo', fetcher(WEBP))).toBe('data:image/png;base64,QUJD');
    expect(canvas.width).toBe(PDF_LOGO_MAX.width);
    expect(canvas.height).toBe(80);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 640, 80);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
    expect(close).toHaveBeenCalled();
  });

  it('małe logo zostaje w swoim rozmiarze (bez powiększania)', async () => {
    const { canvas } = stubCanvas({ width: 120, height: 40 });
    await loadPdfLogo('/app/logo', fetcher(PNG));
    expect([canvas.width, canvas.height]).toEqual([120, 40]);
  });

  it('nieudane przerysowanie: PNG wprost, WebP pominięte', async () => {
    stubCanvas({ width: 120, height: 40 }, 'data:,');
    expect(await loadPdfLogo('/app/logo', fetcher(PNG))).toMatch(/^data:image\/png;base64,/);
    expect(await loadPdfLogo('/app/logo', fetcher(WEBP))).toBeNull();
  });
});

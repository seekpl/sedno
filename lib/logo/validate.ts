/**
 * Logo SMM-owca (PROMPT.md §8, §15): tylko PNG, JPEG albo WebP do 2 MB, bez SVG (ryzyko XSS). Typ
 * rozpoznajemy po sygnaturze pliku, nie po nazwie ani po typie MIME zgłoszonym przez przeglądarkę.
 */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
/**
 * Najdłuższy bok logo w pikselach. 2 MB PNG może mieć 20 000 × 20 000 px (ponad 1,5 GB po zdekodowaniu),
 * a dekoduje go przeglądarka klienta na /r/{token} i przy PDF — limit chroni przed zawieszeniem karty.
 */
export const LOGO_MAX_SIDE = 4000;

export type LogoKind = {
  ext: 'png' | 'jpg' | 'webp';
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
};

export type LogoCheck =
  ({ ok: true } & LogoKind) | { ok: false; reason: 'empty' | 'too-big' | 'unsupported' | 'too-large-image' };

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

export function detectLogo(bytes: Uint8Array): LogoKind | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { ext: 'png', contentType: 'image/png' };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { ext: 'jpg', contentType: 'image/jpeg' };
  // RIFF....WEBP
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { ext: 'webp', contentType: 'image/webp' };
  }
  return null;
}

const be16 = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const be32 = (b: Uint8Array, i: number) => be16(b, i) * 0x10000 + be16(b, i + 2);
const le16 = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
const le24 = (b: Uint8Array, i: number) => le16(b, i) | ((b[i + 2] ?? 0) << 16);

/** Znaczniki JPEG SOFn (rozmiar klatki); C4, C8 i CC to inne segmenty. */
const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i += 1; // bajt wypełnienia
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // znacznik bez długości
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // koniec obrazu albo dane przed klatką
    if (JPEG_SOF.has(marker)) return { height: be16(b, i + 5), width: be16(b, i + 7) };
    i += 2 + be16(b, i + 2);
  }
  return null;
}

/**
 * Wymiary z nagłówka pliku (PNG IHDR, JPEG SOFn, WebP VP8/VP8L/VP8X) — tak jak czyta je przeglądarka przed
 * dekodowaniem. null, gdy nagłówek jest niepełny (taki plik i tak się nie wyświetli).
 */
export function logoSize(bytes: Uint8Array, kind: LogoKind): { width: number; height: number } | null {
  if (kind.ext === 'png') {
    const ihdr = String.fromCharCode(...bytes.subarray(12, 16));
    return ihdr === 'IHDR' && bytes.length >= 24 ? { width: be32(bytes, 16), height: be32(bytes, 20) } : null;
  }
  if (kind.ext === 'jpg') return jpegSize(bytes);
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunk === 'VP8X' && bytes.length >= 30) {
    return { width: le24(bytes, 24) + 1, height: le24(bytes, 27) + 1 };
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const [b0, b1, b2, b3] = [bytes[21]!, bytes[22]!, bytes[23]!, bytes[24]!];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  if (
    chunk === 'VP8 ' &&
    bytes.length >= 30 &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    return { width: le16(bytes, 26) & 0x3fff, height: le16(bytes, 28) & 0x3fff };
  }
  return null;
}

export function checkLogo(bytes: Uint8Array): LogoCheck {
  if (bytes.length === 0) return { ok: false, reason: 'empty' };
  if (bytes.length > LOGO_MAX_BYTES) return { ok: false, reason: 'too-big' };
  const kind = detectLogo(bytes);
  if (!kind) return { ok: false, reason: 'unsupported' };
  const size = logoSize(bytes, kind);
  if (size && (size.width > LOGO_MAX_SIDE || size.height > LOGO_MAX_SIDE)) {
    return { ok: false, reason: 'too-large-image' };
  }
  return { ok: true, ...kind };
}

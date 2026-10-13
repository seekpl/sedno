/**
 * Logo SMM-owca (PROMPT.md §8, §15): tylko PNG, JPEG albo WebP do 2 MB, bez SVG (ryzyko XSS). Typ
 * rozpoznajemy po sygnaturze pliku, nie po nazwie ani po typie MIME zgłoszonym przez przeglądarkę.
 */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export type LogoKind = {
  ext: 'png' | 'jpg' | 'webp';
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
};

export type LogoCheck =
  ({ ok: true } & LogoKind) | { ok: false; reason: 'empty' | 'too-big' | 'unsupported' };

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

export function checkLogo(bytes: Uint8Array): LogoCheck {
  if (bytes.length === 0) return { ok: false, reason: 'empty' };
  if (bytes.length > LOGO_MAX_BYTES) return { ok: false, reason: 'too-big' };
  const kind = detectLogo(bytes);
  return kind ? { ok: true, ...kind } : { ok: false, reason: 'unsupported' };
}

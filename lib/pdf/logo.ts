/**
 * Logo autora do PDF (konta, Faza 2). @react-pdf/renderer rozumie tylko PNG i JPEG, a logo w Ustawieniach może
 * być też WebP. Dlatego przed utworzeniem PDF pobieramy logo z tej samej domeny (/app/logo albo
 * /r/{token}/logo), w przeglądarce przerysowujemy je na płótnie do PNG (najwyżej 640 × 160 px — ostre na
 * wydruku, a PDF zostaje mały) i podajemy jako adres data:. Gdy logo się nie wczyta, PDF powstaje bez niego
 * (z nazwą autora) — logo nigdy nie blokuje pobrania raportu.
 */

/** Pole logo w PDF to 160 × 40 pt; 4 px na punkt wystarczają do druku. */
export const PDF_LOGO_MAX = { width: 640, height: 160 } as const;

export type LogoKind = 'png' | 'jpeg' | 'webp';

/** Rodzaj obrazu po sygnaturze pliku (jak lib/logo/validate.ts na serwerze); inny plik → null. */
export function sniffLogo(bytes: Uint8Array): LogoKind | null {
  const starts = (sig: readonly number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (starts([0xff, 0xd8, 0xff])) return 'jpeg';
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  return null;
}

/** Tylko ścieżka z tej samej domeny („/app/logo”), nigdy obcy host ani „//host”. */
export function isSameOriginPath(src: string): boolean {
  return /^\/(?!\/)/.test(src) && !src.includes('\\');
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Przerysowanie na płótnie do PNG w polu PDF_LOGO_MAX (tylko przeglądarka). Null, gdy się nie da. */
async function redrawAsPng(blob: Blob): Promise<string | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, PDF_LOGO_MAX.width / bitmap.width, PDF_LOGO_MAX.height / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const url = canvas.toDataURL('image/png');
    return url.startsWith('data:image/png;base64,') ? url : null;
  } catch {
    return null;
  }
}

/**
 * Logo jako adres data: PNG albo JPEG do <Image> w PDF, albo null (brak logo, błąd, nieznany format).
 * Pobranie z ciasteczkami tej domeny i bez pamięci podręcznej (logo mogło się zmienić w Ustawieniach).
 */
export async function loadPdfLogo(src: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  if (!isSameOriginPath(src)) return null;
  try {
    const response = await fetcher(src, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const kind = sniffLogo(bytes);
    if (!kind) return null;
    const redrawn = await redrawAsPng(new Blob([bytes], { type: `image/${kind}` }));
    if (redrawn) return redrawn;
    // Bez płótna (np. poza przeglądarką) PNG i JPEG idą wprost; WebP pomijamy.
    return kind === 'webp' ? null : `data:image/${kind};base64,${base64(bytes)}`;
  } catch {
    return null;
  }
}

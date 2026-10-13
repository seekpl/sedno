/** Domyślna strona po zalogowaniu. */
export const AFTER_LOGIN_PATH = '/app/klienci';

/**
 * Ścieżka powrotu po zalogowaniu: tylko wewnątrz /app (bez otwartego przekierowania na inny host,
 * bez „//”, „\\” i znaków sterujących). Wszystko inne → /app/klienci.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value) return AFTER_LOGIN_PATH;
  if (!/^\/app(?:[/?#]|$)/.test(value)) return AFTER_LOGIN_PATH;
  if (value.includes('//') || value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value))
    return AFTER_LOGIN_PATH;
  return value;
}

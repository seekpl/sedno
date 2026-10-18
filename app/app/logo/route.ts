import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { features } from '@/config/features';
import { getCurrentUser } from '@/lib/auth/session';
import { getLogoPath } from '@/lib/data/profile';
import { readLogo } from '@/lib/logo/store';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const empty = (status: number) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * Własne logo zalogowanego użytkownika (podgląd w Ustawieniach, raport w edytorze). Ścieżka z własnego
 * profilu przez sesję (RLS), plik z prywatnego zasobnika kluczem serwisowym (lib/logo/store.ts). Typ
 * z sygnatury pliku (tylko PNG/JPEG/WebP), nosniff, bez SVG. Przeglądarka sprawdza aktualność przy każdym
 * użyciu (private, no-cache), ETag oszczędza ponowne pobranie.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!features.accounts) return empty(404);
  const user = await getCurrentUser();
  if (!user) return empty(401);

  let logo;
  try {
    const path = await getLogoPath(await createSupabaseServerClient());
    logo = await readLogo(path);
  } catch {
    console.error('[sedno] Odczyt własnego logo nie powiódł się.');
    return empty(503);
  }
  if (!logo) return empty(404);

  const etag = `"${createHash('sha256').update(logo.bytes).digest('base64url').slice(0, 27)}"`;
  const headers = {
    'Cache-Control': 'private, no-cache',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });

  return new Response(new Blob([logo.bytes as Uint8Array<ArrayBuffer>], { type: logo.contentType }), {
    status: 200,
    headers: {
      ...headers,
      'Content-Type': logo.contentType,
      'Content-Length': String(logo.bytes.byteLength),
      'Content-Disposition': 'inline',
    },
  });
}

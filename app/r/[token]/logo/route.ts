import type { NextRequest } from 'next/server';
import { features } from '@/config/features';
import { isShareToken, readSharedLogo, SHARE_LOGO_RATE_LIMIT } from '@/lib/data/shared';
import { clientRateLimitKey } from '@/lib/server/client-ip';
import { rateLimit } from '@/lib/server/rate-limit';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/** Każda odmowa wygląda tak samo: nie zdradza, czy token istniał, wygasł, czy właściciel nie ma logo. */
const notFound = () => new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });

/**
 * Logo autora na raporcie publicznym (docs/decisions.md, p. 96): tylko przez aktywny link (nieodwołany,
 * nieprzeterminowany) → właściciel → profiles.logo_path → prywatny zasobnik. Zamiast podpisanego adresu
 * Supabase, który ujawniałby identyfikator właściciela i wymagałby obcego hosta w CSP. Nie zwiększa licznika
 * wyświetleń. Typ z sygnatury pliku (tylko PNG/JPEG/WebP), nosniff, bez SVG.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  if (!features.accounts) return notFound();
  const { token } = await params;
  if (!isShareToken(token)) return notFound();

  const ip = await clientRateLimitKey();
  if (!rateLimit(`share-logo:ip:${ip}`, SHARE_LOGO_RATE_LIMIT.limit, SHARE_LOGO_RATE_LIMIT.windowMs)) {
    return new Response(null, { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } });
  }

  let logo;
  try {
    logo = await readSharedLogo(createSupabaseAdminClient(), token);
  } catch {
    console.error('[sedno] Odczyt logo do raportu publicznego nie powiódł się.');
    return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!logo) return notFound();

  return new Response(new Blob([logo.bytes as Uint8Array<ArrayBuffer>], { type: logo.contentType }), {
    status: 200,
    headers: {
      'Content-Type': logo.contentType,
      'Content-Length': String(logo.bytes.byteLength),
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}

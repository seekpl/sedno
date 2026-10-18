import type { NextRequest } from 'next/server';
import { features } from '@/config/features';
import { safeNextPath } from '@/lib/auth/next-path';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { z } from '@/lib/zod';

/** Dokąd wraca link, który nie zadziałał (wygasł, był użyty, inna przeglądarka). */
const LINK_ERROR_PATH = '/logowanie?blad=link';

/** Kod z Supabase Auth (PKCE): w praktyce UUID; przyjmujemy krótki napis bez znaków specjalnych. */
const querySchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9-]{8,128}$/),
  next: z.string().max(2048).optional().catch(undefined),
});

/** Przekierowanie 303 na ścieżkę tej samej domeny. Ciasteczka sesji dołącza Next.js (cookies()). */
function redirectTo(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path, 'Cache-Control': 'no-store' } });
}

/**
 * Powrót z linku w e-mailu (PROMPT.md §10; docs/decisions.md, p. 93). Supabase Auth po weryfikacji linku
 * odsyła tu z ?code=… (PKCE). Wymiana kodu na sesję wymaga weryfikatora z ciasteczka httpOnly, które ustawiła
 * prośba o link — więc link działa tylko w tej samej przeglądarce. Sesja trafia do ciasteczek httpOnly.
 * Brak lub zły kod, błąd z Supabase (?error=…) albo nieudana wymiana → /logowanie?blad=link.
 * Powrót tylko na ścieżki /app (safeNextPath). Bez flagi kont 404.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!features.accounts) return new Response(null, { status: 404 });

  const params = request.nextUrl.searchParams;
  const parsed = querySchema.safeParse({
    code: params.get('code') ?? undefined,
    next: params.get('next') ?? undefined,
  });
  if (params.has('error') || !parsed.success) return redirectTo(LINK_ERROR_PATH);

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(parsed.data.code);
    if (error) {
      console.error(
        `[sedno] Wymiana kodu logowania nie powiodła się (${error.code ?? error.status ?? 'brak kodu'}).`,
      );
      return redirectTo(LINK_ERROR_PATH);
    }
  } catch {
    console.error('[sedno] Wymiana kodu logowania nie powiodła się.');
    return redirectTo(LINK_ERROR_PATH);
  }

  return redirectTo(safeNextPath(parsed.data.next));
}

import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';
import type { Database } from './database.types';
import { requireSupabasePublicEnv, SESSION_COOKIE_OPTIONS } from './env';

type PendingCookie = { name: string; value: string; options: Record<string, unknown> };

/**
 * Odświeża sesję Supabase w proxy.ts (wzorzec @supabase/ssr): odczytuje użytkownika (zapytanie do Supabase
 * Auth, więc sfałszowane ciasteczko nie przejdzie), a nowe ciasteczka dopisuje do żądania (widzą je Server
 * Components) i do odpowiedzi (przez applyCookies).
 */
export async function refreshSession(request: NextRequest) {
  const { url, anonKey } = requireSupabasePublicEnv();
  let pending: PendingCookie[] = [];
  const supabase = createServerClient<Database>(url, anonKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    auth: { flowType: 'pkce' },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        pending = toSet as PendingCookie[];
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return {
    user,
    applyCookies(response: NextResponse) {
      for (const { name, value, options } of pending) response.cookies.set(name, value, options);
      return response;
    },
  };
}

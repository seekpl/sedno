'use server';

/**
 * Zapis na listę oczekujących (docs/decisions.md, p. 18; PROMPT.md §8, §15). Dla useActionState,
 * działa też bez JavaScriptu (formularz wysyła się zwykłym POST).
 *
 * - zod na wejściu: e-mail (trim, małe litery, do 254 znaków), plan solo/studio, zgoda „on”.
 * - Limit: 5 zapisów na 10 minut z jednego adresu IP (IPv6: sieć /64).
 * - Duplikat (e-mail, plan) daje ten sam sukces — nie zdradzamy, kto już jest na liście.
 * - Bez magazynu danych (albo z błędną konfiguracją) uczciwy błąd, nigdy udawany sukces.
 * - Akcja nigdy nie rzuca wyjątku: formularz zawsze dostaje stan z przyczyną i naprawą.
 * - Adresu e-mail nie logujemy.
 */
import { z } from 'zod';
import { anonIdSchema, EVENT_SCHEMAS } from '@/lib/analytics/events';
import { waitlist as t } from '@/lib/copy/waitlist';
import { clientRateLimitKey } from '@/lib/server/client-ip';
import { rateLimit } from '@/lib/server/rate-limit';
import { getStore, StoreError, type Store } from '@/lib/server/store';

export type WaitlistState = {
  status: 'idle' | 'success' | 'error';
  fieldErrors?: { email?: string; consent?: string };
  message?: string;
  /** Wpisany adres (po normalizacji, jeśli się udała) — formularz pokazuje go ponownie po błędzie. */
  email?: string;
  /** Czy zgoda była zaznaczona — żeby po błędzie adresu nie trzeba jej było zaznaczać od nowa. */
  consent?: boolean;
};

const LIMIT = 5;
const WINDOW_MS = 10 * 60_000;

const formSchema = z.object({
  email: z
    .string({ error: t.errors.emailRequired })
    .trim()
    .toLowerCase()
    .min(1, { error: t.errors.emailRequired })
    .max(254, { error: t.errors.emailTooLong })
    .pipe(z.email({ error: t.errors.emailInvalid })),
  plan: z.enum(['solo', 'studio'], { error: t.errors.invalidPlan }),
  consent: z.literal('on', { error: t.errors.consentRequired }),
  // Identyfikator sesji służy tylko analityce: nieprawidłowy pomijamy, zamiast blokować zapis.
  // Dokładnie 22 znaki base64url, jak tworzy lib/analytics/client.ts (węziej niż anonIdSchema).
  anonId: anonIdSchema
    .regex(/^[A-Za-z0-9_-]{22}$/)
    .optional()
    .catch(undefined),
});

function field(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

export async function joinWaitlist(_prev: WaitlistState, formData: FormData): Promise<WaitlistState> {
  try {
    return await join(formData);
  } catch {
    // Nieoczekiwany błąd (np. wejście, które nie jest formularzem). Bez treści wejścia w logu.
    console.error('[sedno] Zapis na listę nie powiódł się.');
    return { status: 'error', message: t.errors.failed };
  }
}

async function join(formData: FormData): Promise<WaitlistState> {
  const raw = {
    email: field(formData, 'email'),
    plan: field(formData, 'plan'),
    consent: field(formData, 'consent'),
    anonId: field(formData, 'anonId') || undefined,
  };
  const echo = {
    email: raw.email?.trim().slice(0, 254),
    consent: raw.consent === 'on',
  };

  const parsed = formSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    const fieldErrors = { email: errors.email?.[0], consent: errors.consent?.[0] };
    if (!fieldErrors.email && !fieldErrors.consent) {
      // Tylko plan był nieprawidłowy (formularz zmieniony poza stroną).
      return { status: 'error', message: errors.plan?.[0] ?? t.errors.invalidPlan, ...echo };
    }
    return { status: 'error', fieldErrors: strip(fieldErrors), ...echo };
  }

  const { email, plan, anonId } = parsed.data;
  const store = storeOrNull();
  if (!store) return { status: 'error', message: t.errors.unavailable, email, consent: true };

  const ip = await clientRateLimitKey();
  if (!rateLimit(`waitlist:ip:${ip}`, LIMIT, WINDOW_MS)) {
    return { status: 'error', message: t.errors.rateLimited, email, consent: true };
  }

  let result: 'created' | 'exists';
  try {
    result = await store.insertWaitlist({ email, plan, consentAt: new Date() });
  } catch (error) {
    console.error(
      error instanceof StoreError ? `[sedno] ${error.message}` : '[sedno] Zapis na listę nie powiódł się.',
    );
    return { status: 'error', message: t.errors.failed, email, consent: true };
  }

  // Zdarzenie tylko przy nowym wpisie (bez podwójnego liczenia). Jego błąd nie psuje zapisu na listę.
  // Bez identyfikatora sesji: inaczej zdarzenia anonimowej sesji (np. wczytanie pliku) dałoby się powiązać
  // z adresem e-mail przez zbliżony czas zapisu (docs/decisions.md — minimalizacja danych).
  if (result === 'created') {
    void anonId;
    try {
      await store.insertEvent({
        name: 'waitlist_joined',
        anonId: null,
        ownerId: null,
        props: EVENT_SCHEMAS.waitlist_joined.parse({ plan }),
      });
    } catch {
      console.error('[sedno] Zdarzenie waitlist_joined nie zostało zapisane.');
    }
  }

  return { status: 'success' };
}

/** Błędna konfiguracja magazynu (np. nieprawidłowy adres Supabase) to ten sam uczciwy błąd co jego brak. */
function storeOrNull(): Store | null {
  try {
    return getStore();
  } catch {
    console.error('[sedno] Magazyn listy oczekujących jest źle skonfigurowany.');
    return null;
  }
}

function strip(errors: { email?: string; consent?: string }): WaitlistState['fieldErrors'] {
  const out: { email?: string; consent?: string } = {};
  if (errors.email) out.email = errors.email;
  if (errors.consent) out.consent = errors.consent;
  return out;
}

'use server';

/**
 * Dodanie klienta z panelu (PROMPT.md §10 „Panel”). Dla useActionState w oknie „Dodaj klienta”.
 *
 * - Tylko zalogowany użytkownik i tylko z włączonymi kontami; właściciela ustawia baza (auth.uid(), RLS).
 * - zod na wejściu: nazwa 1–80 znaków po oczyszczeniu, branża z listy (lib/data/panel.ts).
 * - Limit: 30 nowych klientów na 10 minut na konto (ochrona przed zalewem wierszy).
 * - Akcja nie rzuca wyjątku i nie zwraca treści błędów bazy; nazwy klienta nie logujemy.
 */
import { revalidatePath } from 'next/cache';
import { features } from '@/config/features';
import { getCurrentUser } from '@/lib/auth/session';
import { panel as t } from '@/lib/copy/panel';
import { clientInputSchema, createClient as insertClient } from '@/lib/data/panel';
import { rateLimit } from '@/lib/server/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { z } from '@/lib/zod';

export type AddClientState =
  | { status: 'idle' }
  | { status: 'success'; id: string; name: string }
  | {
      status: 'error';
      fieldErrors?: { name?: string; industry?: string };
      message?: string;
    };

const LIMIT = 30;
const WINDOW_MS = 10 * 60_000;

function field(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' ? value : undefined;
}

export async function createClient(_prev: AddClientState, formData: FormData): Promise<AddClientState> {
  try {
    return await create(formData);
  } catch {
    console.error('[sedno] Dodanie klienta nie powiodło się.');
    return { status: 'error', message: t.add.errors.failed };
  }
}

async function create(formData: FormData): Promise<AddClientState> {
  if (!features.accounts) return { status: 'error', message: t.add.errors.failed };
  const user = await getCurrentUser();
  if (!user) return { status: 'error', message: t.add.errors.session };

  const parsed = clientInputSchema.safeParse({
    name: field(formData, 'name') ?? '',
    industry: field(formData, 'industry') || undefined,
  });
  if (!parsed.success) {
    const errors = z.flattenError(parsed.error).fieldErrors;
    const fieldErrors: { name?: string; industry?: string } = {};
    if (errors.name?.[0]) fieldErrors.name = errors.name[0];
    if (errors.industry?.[0]) fieldErrors.industry = errors.industry[0];
    return { status: 'error', fieldErrors };
  }

  if (!rateLimit(`clients:create:${user.id}`, LIMIT, WINDOW_MS)) {
    return { status: 'error', message: t.add.errors.rateLimited };
  }

  const db = await createSupabaseServerClient();
  const created = await insertClient(db, parsed.data);
  revalidatePath('/app/klienci');
  return { status: 'success', id: created.id, name: created.name };
}

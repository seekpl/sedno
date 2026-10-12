/**
 * Zdarzenia testu popytu (PROMPT.md §16). Każde zdarzenie ma ścisły schemat: tylko wymienione pola,
 * tylko liczby, krótkie wyliczenia i identyfikator sesji. Nie da się nim wysłać treści pliku ani raportu.
 */
import { z } from '@/lib/zod';

const small = (max: number) => z.number().int().min(0).max(max);

export const EVENT_SCHEMAS = {
  landing_cta_click: z
    .object({ cta: z.enum(['header', 'hero', 'pricing', 'cta-band', 'example', 'menu']) })
    .strict(),
  csv_parsed: z.object({ rows: small(20_000), months: small(120), ms: small(600_000) }).strict(),
  csv_error: z
    .object({
      code: z.enum(['E_NOT_CSV', 'E_EMPTY', 'E_TOO_BIG', 'E_MISSING_COLUMNS', 'E_NO_ROWS_IN_MONTH']),
    })
    .strict(),
  report_previewed: z.object({ mode: z.enum(['anon', 'account']) }).strict(),
  pdf_downloaded: z
    .object({ mode: z.enum(['anon', 'account']), branding: z.enum(['sedno-footer', 'author']) })
    .strict(),
  signup_completed: z.object({}).strict(),
  link_created: z.object({}).strict(),
  link_opened: z.object({}).strict(),
  checkout_started: z.object({ product: z.enum(['solo', 'single']) }).strict(),
  purchase_completed: z.object({ product: z.enum(['solo', 'single']) }).strict(),
  waitlist_joined: z.object({ plan: z.enum(['solo', 'studio']) }).strict(),
} as const;

export type EventName = keyof typeof EVENT_SCHEMAS;
export type EventProps<N extends EventName> = z.infer<(typeof EVENT_SCHEMAS)[N]>;

/** Losowy identyfikator sesji (sessionStorage, bez cookies): 16 bajtów → dokładnie 22 znaki base64url. */
export const anonIdSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);

export const eventInputSchema = z
  .object({
    name: z.enum(Object.keys(EVENT_SCHEMAS) as [EventName, ...EventName[]]),
    anonId: anonIdSchema,
    props: z.record(z.string(), z.unknown()),
  })
  .strict()
  .superRefine((value, ctx) => {
    const parsed = EVENT_SCHEMAS[value.name].safeParse(value.props);
    if (!parsed.success) ctx.addIssue({ code: 'custom', message: 'Nieprawidłowe właściwości zdarzenia' });
  });

export type EventInput = { name: EventName; anonId: string; props: Record<string, unknown> };

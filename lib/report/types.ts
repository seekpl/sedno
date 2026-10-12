/**
 * ReportData — jedyny format raportu (PROMPT.md §5, §7). Ten sam obiekt renderuje podgląd, stronę /r/[token]
 * i PDF. Zawiera wyłącznie liczby zagregowane, komentarz autora i krótką listę najlepszych publikacji
 * (data, typ, wyświetlenia, interakcje, permalink) — nigdy opisów postów ani surowych wierszy.
 */
import { z } from 'zod';

export type KeyMetric = 'book' | 'call' | 'directions' | 'views';
export type ActionKey = Exclude<KeyMetric, 'views'>;
export type Actions = { book: number | null; call: number | null; directions: number | null };
export type Branding = 'sedno-footer' | 'author';

const count = z.number().int().min(0).max(1_000_000_000);
const nullableCount = count.nullable();
const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const isoDate = z.string().datetime({ offset: true });
const instagramUrl = z
  .string()
  .max(300)
  .regex(/^https:\/\/www\.instagram\.com\/[A-Za-z0-9._\-/?=&%]*$/);

export const topPostSchema = z
  .object({
    publishedAt: isoDate,
    type: z.enum(['reel', 'post', 'carousel', 'story', 'other']),
    views: nullableCount,
    interactions: nullableCount,
    permalink: instagramUrl.optional(),
  })
  .strict();

export const summarySchema = z
  .object({
    posts: count,
    byType: z.partialRecord(z.enum(['reel', 'post', 'carousel', 'story', 'other']), count),
    views: nullableCount,
    interactions: nullableCount,
    follows: nullableCount,
    topPosts: z.array(topPostSchema).max(3),
  })
  .strict();

export const actionsSchema = z
  .object({ book: nullableCount, call: nullableCount, directions: nullableCount })
  .strict();

const text = (max: number) => z.string().max(max);

export const reportDataSchema = z
  .object({
    period: monthKey,
    client: z.object({ name: text(80).min(1) }).strict(),
    author: z.object({ name: text(80), logoUrl: z.string().url().max(2000).optional() }).strict(),
    branding: z.enum(['sedno-footer', 'author']),
    summary: summarySchema,
    actions: actionsSchema,
    previous: z
      .object({
        source: z.enum(['file', 'history', 'manual']),
        summary: summarySchema.partial().optional(),
        actions: actionsSchema.partial().optional(),
      })
      .strict()
      .optional(),
    keyMetric: z.enum(['book', 'call', 'directions', 'views']),
    headline: text(160).min(1),
    commentWorked: text(1200).optional(),
    /** Jedno zdanie (fragment) z commentWorked podkreślone zakreślaczem. Pierwsze wystąpienie. */
    commentMark: text(300).optional(),
    planNext: text(1200).optional(),
    dataRange: z.object({ from: isoDate, to: isoDate }).strict(),
    flags: z
      .object({
        incompleteDays: z.number().int().min(1).max(31).optional(),
        metricChangeNote: z.boolean().optional(),
        inProgress: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

export type TopPost = z.infer<typeof topPostSchema>;
export type ReportSummary = z.infer<typeof summarySchema>;
export type ReportData = z.infer<typeof reportDataSchema>;

/**
 * Raport z danymi przykładowymi (marki zmyślone, jak w brand/reference/: Kadr Social, Studio Lumi).
 * Używany na stronie głównej i /przyklad — zawsze z oznaczeniem „Dane przykładowe” (zasada 6).
 */
import type { ReportData } from './types';

export const EXAMPLE_REPORT: ReportData = {
  period: '2026-09',
  client: { name: 'Studio Lumi' },
  author: { name: 'Kadr Social' },
  branding: 'sedno-footer',
  summary: {
    posts: 31,
    byType: { reel: 8, post: 9, story: 14 },
    views: 12480,
    interactions: 611,
    follows: 64,
    topPosts: [],
  },
  actions: { book: 23, call: 9, directions: 14 },
  previous: {
    source: 'file',
    summary: { views: 11420, follows: 51 },
    actions: { book: 17, call: 11, directions: 10 },
  },
  keyMetric: 'book',
  headline: '23 osoby chciały się umówić',
  commentWorked:
    'Najwięcej rezerwacji przyszło po rolkach z metamorfozami brwi. Trzy z nich weszły do pięciu najlepiej oglądanych treści miesiąca.',
  commentMark: 'rolkach z metamorfozami brwi',
  planNext:
    'Cztery kolejne rolki z metamorfozami, cennik w wyróżnionych relacjach, jedna sesja w salonie (15 października).',
  dataRange: { from: '2026-09-01T00:00:00+02:00', to: '2026-09-30T23:59:59+02:00' },
  flags: {},
};

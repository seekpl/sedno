/**
 * Poradniki (PROMPT.md §12): rejestr artykułów MDX z tego katalogu i lista planowanych tytułów
 * (brand/docs/4-komunikacja.md, „Pięć nagłówków SEO”). Planowane nie mają stron ani linków.
 * Plik artykułu: content/poradniki/{slug}.mdx.
 */

export type GuideStatus = 'draft' | 'published';

export type Guide = {
  slug: string;
  title: string;
  description: string;
  /** draft = tylko nagłówki i miejsca na zrzuty ekranu, bez instrukcji klikania. */
  status: GuideStatus;
};

export const GUIDES: readonly Guide[] = [
  {
    slug: 'jak-zrobic-raport-z-instagrama-dla-klienta',
    title: 'Jak zrobić raport z Instagrama dla klienta (Meta Business Suite, 2026)',
    description:
      'Eksport treści z Meta Business Suite, trzy liczby z panelu profesjonalnego i komentarz: z czego składa się miesięczny raport dla klienta.',
    status: 'draft',
  },
];

/** Tytuły w przygotowaniu (pozycje 2–5 z „Pięciu nagłówków SEO”). Bez stron, bez linków. */
export const PLANNED_GUIDES: readonly string[] = [
  'Szablon raportu social media dla klienta: arkusz i Canva za darmo',
  'Statystyki Instagrama: gdzie je sprawdzić i co pokazać klientowi',
  'Wyświetlenia zamiast zasięgu: co Meta zmieniła w statystykach Instagrama',
  'Ile kosztuje prowadzenie Instagrama firmy i jak pokazać, że się opłaca',
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}

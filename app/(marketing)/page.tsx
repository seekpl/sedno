import { copy } from '@/lib/copy/pl';

// Tymczasowa strona Fazy 0. Pełna strona główna powstaje w Fazie 1 (PROMPT.md §12).
export default function Home() {
  return <h1 className="display-xl">{copy.meta.h1}</h1>;
}

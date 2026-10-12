import { Alert } from '@/components/ui/Alert';
import { copy } from '@/lib/copy/pl';
import s from './LegalPage.module.css';

export type LegalPageId = 'privacy' | 'terms' | 'contact';

/**
 * Strona prawna ze szkieletu w lib/copy/legal-pages.ts (PROMPT.md §15): fakty o przepływie danych
 * i miejsca „[DO UZUPEŁNIENIA przez prawnika]”. Ostateczny tekst pisze prawnik — stąd informacja o szkicu
 * i noindex w metadanych stron.
 */
export function LegalPage({ page }: { page: LegalPageId }) {
  const { title, sections } = copy.legalPages[page];
  return (
    <article className={s.page}>
      <h1 className="heading-1">{title}</h1>
      <Alert variant="warning" title={copy.legalPages.draftNotice} />
      {sections.map((section) => (
        <section key={section.title} className={s.section}>
          <h2 className="heading-3">{section.title}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="sd-secondary">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}

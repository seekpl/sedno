import { buttonClass } from '@/components/ui/buttonClass';
import { copy } from '@/lib/copy/pl';
import { WaitlistForm } from './WaitlistForm';
import s from './NotifyDisclosure.module.css';

/**
 * „Powiadom mnie o starcie” — natywne <details> z formularzem listy oczekujących (PROMPT.md §12,
 * docs/decisions.md, p. 17–18). Otwiera się bez JavaScriptu; formularz działa także bez niego.
 * Pokazuj tylko wtedy, gdy lista działa (waitlistEnabled()), inaczej byłby to martwy przycisk.
 * Po wysłaniu bez JavaScriptu strona wraca z zamkniętym <details>; wynik i tak jest widoczny (CSS modułu).
 */
export function NotifyDisclosure({ plan }: { plan: 'solo' | 'studio' }) {
  return (
    <details className={s.disclosure}>
      <summary className={buttonClass({ block: true, className: s.summary })}>
        {copy.landing.pricing.notify}
      </summary>
      <div className={s.body}>
        <WaitlistForm plan={plan} />
      </div>
    </details>
  );
}

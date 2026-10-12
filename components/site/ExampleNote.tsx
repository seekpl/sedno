import { copy } from '@/lib/copy/pl';
import { cx } from '@/lib/cx';
import s from './ExampleNote.module.css';

/**
 * Oznaczenie „Dane przykładowe” przy każdej liczbie z przykładu (CLAUDE.md, zasada 6).
 * Wygląd jak .note-ex w brand/reference/screens/EkranLanding.html.
 */
export function ExampleNote({ className }: { className?: string }) {
  return <p className={cx(s.note, className)}>{copy.landing.example.badge}</p>;
}

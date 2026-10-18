/**
 * Wszystkie teksty interfejsu (PROMPT.md §14) — jedno źródło. Ton: brand/docs/4-komunikacja.md.
 * Do SMM-owca na „Ty”, raport bezosobowo, zdaniowa wielkość liter, bez emoji i wykrzykników,
 * cudzysłowy „ ” i » «. Każdy obszar ma własny plik w lib/copy/.
 */
import { app } from './app';
import { auth } from './auth';
import { common } from './common';
import { csv } from './csv';
import { editor } from './editor';
import { history } from './history';
import { landing } from './landing';
import { legalPages } from './legal-pages';
import { panel } from './panel';
import { report } from './report';
import { settings } from './settings';
import { share } from './share';
import { tool } from './tool';
import { waitlist } from './waitlist';

export const copy = {
  ...common,
  app,
  auth,
  csv,
  editor,
  history,
  landing,
  legalPages,
  panel,
  report,
  settings,
  share,
  tool,
  waitlist,
} as const;

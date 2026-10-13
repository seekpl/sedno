/**
 * Wszystkie teksty interfejsu (PROMPT.md §14) — jedno źródło. Ton: brand/docs/4-komunikacja.md.
 * Do SMM-owca na „Ty”, raport bezosobowo, zdaniowa wielkość liter, bez emoji i wykrzykników,
 * cudzysłowy „ ” i » «. Każdy obszar ma własny plik w lib/copy/.
 */
import { app } from './app';
import { common } from './common';
import { csv } from './csv';
import { landing } from './landing';
import { legalPages } from './legal-pages';
import { report } from './report';
import { tool } from './tool';
import { waitlist } from './waitlist';

export const copy = { ...common, app, csv, landing, legalPages, report, tool, waitlist } as const;

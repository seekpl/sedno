/**
 * Kontrakt edytora raportu z kontem: dane od strony (Server Component) i działania serwera (Server Actions
 * z app/app/klienci/[id]/[miesiac]/actions.ts). Wyniki działań są małe i w kształcie interfejsu — bez wierszy
 * bazy i bez treści błędów bazy.
 */
import type { MonthKey } from '@/lib/i18n/pl';
import type { ReportData } from '@/lib/report/types';

export type SavedStatus = 'draft' | 'ready' | 'sent';

/** Logo autora z tej samej domeny (trasa ustawień konta). */
export const APP_LOGO_SRC = '/app/logo';

/** Stan zapisanego raportu w edytorze. */
export type ReportRecord = { status: SavedStatus; sentAt: string | null };

/** Zapisany raport przekazany ze strony do edytora. */
export type SavedSnapshot = ReportRecord & { data: ReportData };

/** Aktywny link do raportu: pełny adres, ważność i licznik otwarć. */
export type LinkView = { token: string; url: string; expiresAt: string; views: number };

export type ActionFailure = { ok: false; error: string };

export type SaveResult = { ok: true; report: SavedSnapshot } | ActionFailure;
export type LinkResult = { ok: true; link: LinkView } | ActionFailure;
export type RevokeResult = { ok: true } | ActionFailure;
export type StatusResult = { ok: true; report: ReportRecord } | ActionFailure;

export type ReportRef = { clientId: string; month: MonthKey };

export type EditorActions = {
  save: (input: ReportRef & { data: ReportData; intent: 'draft' | 'ready' }) => Promise<SaveResult>;
  createLink: (input: ReportRef) => Promise<LinkResult>;
  revokeLink: (input: { token: string }) => Promise<RevokeResult>;
  markSent: (input: ReportRef) => Promise<StatusResult>;
  undoSent: (input: ReportRef) => Promise<StatusResult>;
};

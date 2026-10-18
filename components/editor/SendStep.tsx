'use client';

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Report } from '@/components/report/Report';
import { buttonSizes } from '@/components/tool/parts';
import toolStyles from '@/components/tool/tool.module.css';
import { Alert } from '@/components/ui/Alert';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { TextField } from '@/components/ui/TextField';
import { useToast } from '@/components/ui/Toast';
import { track } from '@/lib/analytics/client';
import { editor } from '@/lib/copy/editor';
import { cx } from '@/lib/cx';
import { formatDate } from '@/lib/i18n/pl';
import { downloadReportPdf } from '@/lib/pdf/download';
import type { ReportData } from '@/lib/report/types';
import type { EditorActions, LinkView, ReportRecord, ReportRef } from './types';
import s from './editor.module.css';

const t = editor.send;

type SendStepProps = {
  header: ReactNode;
  reportRef: ReportRef;
  clientName: string;
  /** Zapisany raport — to samo, co zobaczy klient pod linkiem i w PDF. */
  report: ReportData;
  record: ReportRecord;
  link: LinkView | null;
  /** Link wyłączony w tej karcie: zamiast „Utwórz link” — „Utwórz nowy link” z wyjaśnieniem. */
  linkRevoked: boolean;
  logoSrc?: string;
  isPhone: boolean;
  actions: EditorActions;
  /** Id elementu, na który edytor przeniesie fokus po renderze (gdy znika przycisk z fokusem). */
  pendingFocusRef: RefObject<string | null>;
  onRecord: (record: ReportRecord) => void;
  onLink: (link: LinkView | null) => void;
  onBack: () => void;
};

type Busy = null | 'link' | 'revoke' | 'pdf' | 'sent' | 'undo';

/**
 * Krok 3 — Wyślij (bez makiety; z komponentów marki): status, link do raportu (utwórz, kopiuj, wyłącz),
 * PDF i oznaczenie wysłania z „Cofnij”. Obok (od 1024 px) albo niżej — raport tak, jak zobaczy go klient.
 * Działania mówią wynikiem tym samym słowem co przycisk („Kopiuj link” → „Link skopiowany”).
 */
export function SendStep({
  header,
  reportRef,
  clientName,
  report,
  record,
  link,
  linkRevoked,
  logoSrc,
  isPhone,
  actions,
  pendingFocusRef,
  onRecord,
  onLink,
  onBack,
}: SendStepProps) {
  const id = useId();
  const toast = useToast();
  const sizes = buttonSizes(isPhone);
  const [busy, setBusy] = useState<Busy>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [sentError, setSentError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** „Cofnij” w toaście może przyjść po wyjściu z kroku 3 — wtedy nie przenosimy fokusu. */
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const focusNext = (target: string) => {
    if (mounted.current) pendingFocusRef.current = target;
  };
  const ids = {
    url: `${id}-url`,
    copy: `${id}-copy`,
    create: `${id}-create`,
    mark: `${id}-mark`,
    undo: `${id}-undo`,
  };

  const run = async (kind: Exclude<Busy, null>, task: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    try {
      await task();
    } finally {
      setBusy(null);
    }
  };

  const createLink = () =>
    run('link', async () => {
      setLinkError(null);
      try {
        const result = await actions.createLink(reportRef);
        if (!result.ok) {
          setLinkError(result.error);
          return;
        }
        focusNext(ids.copy);
        onLink(result.link);
        toast({ message: t.link.created });
      } catch {
        setLinkError(editor.errors.failed);
      }
    });

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast({ message: t.link.copied });
    } catch {
      // Bez dostępu do schowka: zaznaczony adres w polu i przyczyna z naprawą.
      const field = document.getElementById(ids.url) as HTMLInputElement | null;
      field?.focus();
      field?.select();
      toast({ message: t.link.copyFailed, variant: 'error' });
    }
  };

  const revokeLink = () =>
    run('revoke', async () => {
      if (!link) return;
      setLinkError(null);
      try {
        const result = await actions.revokeLink({ token: link.token });
        setConfirmOpen(false);
        if (!result.ok) {
          setLinkError(result.error);
          return;
        }
        // Przycisk „Wyłącz link” znika: fokus na „Utwórz nowy link”.
        focusNext(ids.create);
        onLink(null);
        toast({ message: t.link.revoked });
      } catch {
        setConfirmOpen(false);
        setLinkError(editor.errors.failed);
      }
    });

  const downloadPdf = () =>
    run('pdf', async () => {
      setPdfError(false);
      try {
        await downloadReportPdf(report, logoSrc ? { logoSrc } : undefined);
        toast({ message: t.pdf.downloaded });
        track('pdf_downloaded', { mode: 'account', branding: report.branding });
      } catch {
        setPdfError(true);
      }
    });

  const undoSent = () =>
    run('undo', async () => {
      setSentError(null);
      try {
        const result = await actions.undoSent(reportRef);
        if (!result.ok) {
          setSentError(result.error);
          return;
        }
        focusNext(ids.mark);
        onRecord(result.report);
        toast({ message: t.sent.undone });
      } catch {
        setSentError(editor.errors.failed);
      }
    });

  const markSent = () =>
    run('sent', async () => {
      setSentError(null);
      try {
        const result = await actions.markSent(reportRef);
        if (!result.ok) {
          setSentError(result.error);
          return;
        }
        focusNext(ids.undo);
        onRecord(result.report);
        toast({
          message: t.sent.toast(clientName),
          action: { label: t.sent.undo, onClick: () => void undoSent() },
        });
      } catch {
        setSentError(editor.errors.failed);
      }
    });

  const sent = record.status === 'sent';

  return (
    <div className={s.send}>
      {header}

      <div className={s.sendGrid}>
        <div className={s.panel}>
          <div className={s.status}>
            <p className={s.statusLine}>
              <span className="label">{t.status}</span>
              <StatusBadge status={record.status} />
            </p>
            {sent && record.sentAt && (
              <p className={cx('body-s', s.muted)}>{t.sentOn(formatDate(new Date(record.sentAt)))}</p>
            )}
          </div>

          <section className={cx('sd-card', s.card)} aria-labelledby={`${id}-link`}>
            <h2 id={`${id}-link`} className="heading-3">
              {t.link.title}
            </h2>
            {link ? (
              <>
                <TextField
                  id={ids.url}
                  label={t.link.field}
                  value={link.url}
                  readOnly
                  wide
                  hint={`${t.link.expires(formatDate(new Date(link.expiresAt)))} ${t.link.views(link.views)}`}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <div className={s.buttons}>
                  <Button
                    id={ids.copy}
                    variant="primary"
                    icon="copy"
                    size={sizes.main}
                    block={isPhone}
                    onClick={() => void copyLink()}
                  >
                    {t.link.copy}
                  </Button>
                  <Button
                    variant="ghost"
                    size={sizes.main}
                    block={isPhone}
                    onClick={() => setConfirmOpen(true)}
                  >
                    {t.link.revoke}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className={cx('body-s', s.muted)}>{linkRevoked ? t.link.revokedNote : t.link.lead}</p>
                <div className={s.buttons}>
                  <Button
                    id={ids.create}
                    variant="primary"
                    icon="link"
                    size={sizes.main}
                    block={isPhone}
                    busy={busy === 'link'}
                    onClick={() => void createLink()}
                  >
                    {linkRevoked ? t.link.createNew : t.link.create}
                  </Button>
                </div>
              </>
            )}
            {linkError && <Alert variant="error" title={linkError} />}
          </section>

          <section className={cx('sd-card', s.card)} aria-labelledby={`${id}-pdf`}>
            <h2 id={`${id}-pdf`} className="heading-3">
              {t.pdf.title}
            </h2>
            <p className={cx('body-s', s.muted)}>{t.pdf.lead}</p>
            <div className={s.buttons}>
              <Button
                icon="download"
                size={sizes.main}
                block={isPhone}
                busy={busy === 'pdf'}
                onClick={() => void downloadPdf()}
              >
                {t.pdf.button}
              </Button>
            </div>
            {pdfError && (
              <Alert variant="error" title={t.pdf.error.title}>
                {t.pdf.error.body}
              </Alert>
            )}
          </section>

          <section className={cx('sd-card', s.card)} aria-labelledby={`${id}-sent`}>
            <h2 id={`${id}-sent`} className="heading-3">
              {t.sent.title}
            </h2>
            <p className={cx('body-s', s.muted)}>{t.sent.lead}</p>
            <div className={s.buttons}>
              {sent ? (
                <Button
                  id={ids.undo}
                  variant="ghost"
                  size={sizes.main}
                  block={isPhone}
                  busy={busy === 'undo'}
                  onClick={() => void undoSent()}
                >
                  {t.sent.undoMark}
                </Button>
              ) : (
                <Button
                  id={ids.mark}
                  icon="check"
                  size={sizes.main}
                  block={isPhone}
                  busy={busy === 'sent'}
                  onClick={() => void markSent()}
                >
                  {t.sent.mark}
                </Button>
              )}
            </div>
            {sentError && <Alert variant="error" title={sentError} />}
          </section>

          <div className={s.buttons}>
            <Button variant="ghost" size={sizes.main} block={isPhone} onClick={onBack}>
              {t.back}
            </Button>
          </div>
        </div>

        <section className={cx(toolStyles.sheet, s.sheet)} aria-label={t.preview}>
          <Report data={report} headingLevel={2} logoSrc={logoSrc} />
        </section>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t.link.confirm.title}
        actions={
          <>
            <Button size={sizes.main} onClick={() => setConfirmOpen(false)}>
              {t.link.confirm.cancel}
            </Button>
            <Button
              variant="danger"
              size={sizes.main}
              busy={busy === 'revoke'}
              onClick={() => void revokeLink()}
            >
              {t.link.revoke}
            </Button>
          </>
        }
      >
        {t.link.confirm.body}
      </Modal>
    </div>
  );
}

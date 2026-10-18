import Link from 'next/link';
import { Alert } from '@/components/ui/Alert';
import { StatusBadge } from '@/components/ui/Badge';
import { buttonClass } from '@/components/ui/buttonClass';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Metric } from '@/components/ui/Metric';
import { Progress } from '@/components/ui/Progress';
import { panel as t } from '@/lib/copy/panel';
import { cx } from '@/lib/cx';
import type { MonthOverview, PanelRow } from '@/lib/data/panel';
import { addMonths, formatNumber, type MonthKey } from '@/lib/i18n/pl';
import { AddClientButton } from './AddClientButton';
import {
  editorHref,
  initials,
  PANEL_HEADING_ID,
  rowAction,
  showsWorkingDays,
  workingDaysLeft,
} from './model';
import s from './Panel.module.css';

/**
 * Panel klientów na miesiąc (EkranPanel.html, PROMPT.md §10 „Panel”): nagłówek z postępem, trzy karty
 * z liczbami, tabela od 768 px (poniżej karty) z działaniem w każdym wierszu, pusty stan bez klientów.
 * Brak danych to „—”, nigdy 0.
 */
export function PanelView({ month, now, overview }: { month: MonthKey; now: Date; overview: MonthOverview }) {
  const empty = overview.total === 0;
  return (
    <div className={s.panel}>
      <header className={s.header}>
        <div className={s.intro}>
          <h1 id={PANEL_HEADING_ID} tabIndex={-1} className={cx('heading-2', s.title)}>
            {t.heading(month)}
          </h1>
          {!empty && <Subtitle month={month} now={now} overview={overview} />}
        </div>
        {!empty && <HeaderActions month={month} rows={overview.rows} />}
      </header>

      {empty ? (
        <EmptyState
          title={t.empty.title}
          actions={
            <>
              <AddClientButton variant="primary" className={s.touch} />
              <a className={cx('sd-link', s.touchLink)} href="/przyklad">
                {t.empty.example}
              </a>
            </>
          }
        >
          {t.empty.body}
        </EmptyState>
      ) : (
        <>
          <Stats month={month} overview={overview} />
          <ClientsTable month={month} rows={overview.rows} />
          <p className="caption sd-muted">{t.footnote}</p>
        </>
      )}
    </div>
  );
}

function Subtitle({ month, now, overview }: { month: MonthKey; now: Date; overview: MonthOverview }) {
  const sent = t.sentLine(overview.sentCount, overview.total);
  return (
    <p className="sd-secondary">
      {showsWorkingDays(month, now) ? `${sent} ${t.workingDaysLeft(workingDaysLeft(now))}` : sent}
    </p>
  );
}

/** „Dodaj klienta” i „Wgraj eksport” (do pierwszego klienta bez raportu; bez takiego klienta — brak). */
function HeaderActions({ month, rows }: { month: MonthKey; rows: PanelRow[] }) {
  const missing = rows.find((row) => row.status === 'no-export');
  return (
    <div className={s.actions}>
      <AddClientButton className={s.touch} />
      {missing && (
        <Link
          href={editorHref(missing.id, month)}
          className={buttonClass({ variant: 'primary', className: s.touch })}
        >
          <Icon name="upload" />
          {t.actions.upload}
        </Link>
      )}
    </div>
  );
}

function Stats({ month, overview }: { month: MonthKey; overview: MonthOverview }) {
  const { sentCount, total } = overview;
  return (
    <section className={s.stats} aria-label={t.stats.label}>
      <div className="sd-card sd-metric">
        <span className="sd-metric__label">{t.stats.sent.label}</span>
        <span className="sd-metric__value">{t.stats.sent.value(sentCount, total)}</span>
        <div className={s.progress}>
          <Progress
            value={total > 0 ? (sentCount / total) * 100 : 0}
            label={t.stats.sent.progress(sentCount, total)}
          />
        </div>
      </div>
      <Metric
        className="sd-card"
        icon="booking"
        label={t.stats.book.label}
        value={formatNumber(overview.bookSum)}
        delta={t.stats.book.previous(addMonths(month, -1), overview.bookSumPrevious)}
      />
      <Metric className="sd-card" label={t.stats.clients.label} value={formatNumber(total)} />
    </section>
  );
}

function ClientsTable({ month, rows }: { month: MonthKey; rows: PanelRow[] }) {
  const columns: Column<PanelRow>[] = [
    {
      key: 'client',
      header: t.table.client,
      render: (row) => (
        <div className="sd-client">
          <span className="sd-avatar" aria-hidden="true">
            {initials(row.name)}
          </span>
          {row.name}
        </div>
      ),
    },
    { key: 'book', header: t.table.book, numeric: true, value: (row) => row.book },
    { key: 'call', header: t.table.call, numeric: true, value: (row) => row.call },
    { key: 'views', header: t.table.views, numeric: true, value: (row) => row.views },
    { key: 'status', header: t.table.status, render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: t.table.actions,
      headerHidden: true,
      render: (row) => {
        const action = rowAction(row.status, row, month);
        return (
          <div className={s.rowAction}>
            <Link href={action.href} className={buttonClass({ variant: 'ghost', size: 's' })}>
              {action.label} <span className="sd-visually-hidden">{action.rest}</span>
            </Link>
          </div>
        );
      },
    },
  ];
  return (
    <DataTable caption={t.table.caption(month)} columns={columns} rows={rows} rowKey={(row) => row.id} />
  );
}

/** Błąd odczytu: przyczyna i naprawa (odświeżenie tego samego adresu). */
export function PanelLoadError({ month, href }: { month: MonthKey; href: string }) {
  return (
    <div className={s.panel}>
      <header className={s.header}>
        <div className={s.intro}>
          <h1 id={PANEL_HEADING_ID} tabIndex={-1} className={cx('heading-2', s.title)}>
            {t.heading(month)}
          </h1>
        </div>
      </header>
      <Alert
        variant="error"
        title={t.loadError.title}
        actions={
          <a className={buttonClass({ className: s.touch })} href={href}>
            {t.loadError.retry}
          </a>
        }
      >
        {t.loadError.body}
      </Alert>
    </div>
  );
}

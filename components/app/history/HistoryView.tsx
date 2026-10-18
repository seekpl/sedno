import Link from 'next/link';
import { initials } from '@/components/app/panel/model';
import { Alert } from '@/components/ui/Alert';
import { StatusBadge } from '@/components/ui/Badge';
import { buttonClass } from '@/components/ui/buttonClass';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Pagination } from '@/components/ui/Pagination';
import { history as t } from '@/lib/copy/history';
import { cx } from '@/lib/cx';
import type { HistoryPage, HistoryRow, LinkState } from '@/lib/data/history';
import { formatDate, monthForms, monthLabel, parseMonthKey, type MonthKey } from '@/lib/i18n/pl';
import { HISTORY_HEADING_ID, HISTORY_PATH, historyHref, reportHref } from './model';
import s from './History.module.css';

/** Ikona stanu linku (status zawsze słowem i ikoną). */
const LINK_ICONS: Record<Exclude<LinkState, 'none'>, IconName> = {
  active: 'link',
  revoked: 'close',
  expired: 'alert',
};

/** „wrzesień 2026” — miesiąc w środku zdania (nazwa dostępna działania „Otwórz”). */
const monthInSentence = (month: MonthKey) => `${monthForms(month).nom} ${parseMonthKey(month).year}`;

/** Brak wartości: widoczne „—”, słowo dla czytników. */
function Missing({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sd-visually-hidden">{label}</span>
    </>
  );
}

export function LinkStateLabel({ state }: { state: LinkState }) {
  if (state === 'none') return <Missing label={t.noLink} />;
  return (
    <span className={cx(s.linkState, state !== 'active' && 'sd-secondary')}>
      <Icon name={LINK_ICONS[state]} size="s" />
      {t.link[state]}
    </span>
  );
}

const COLUMNS: Column<HistoryRow>[] = [
  {
    key: 'client',
    header: t.table.client,
    render: (row) => (
      <div className="sd-client">
        <span className="sd-avatar" aria-hidden="true">
          {initials(row.clientName)}
        </span>
        <span>{row.clientName}</span>
      </div>
    ),
  },
  {
    key: 'month',
    header: t.table.month,
    render: (row) => <span className="sd-num">{monthLabel(row.month)}</span>,
  },
  {
    key: 'status',
    header: t.table.status,
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'sent',
    header: t.table.sent,
    render: (row) =>
      row.sentAt ? (
        <span className="sd-num">{formatDate(new Date(row.sentAt))}</span>
      ) : (
        <Missing label={t.notSent} />
      ),
  },
  {
    key: 'link',
    header: t.table.link,
    render: (row) => <LinkStateLabel state={row.link} />,
  },
  {
    key: 'actions',
    header: t.table.actions,
    headerHidden: true,
    render: (row) => (
      <div className={s.rowAction}>
        <Link
          href={reportHref(row.clientId, row.month)}
          className={buttonClass({ variant: 'ghost', size: 's' })}
        >
          {t.open.label}{' '}
          <span className="sd-visually-hidden">
            {t.open.rest(row.clientName, monthInSentence(row.month))}
          </span>
        </Link>
      </div>
    ),
  },
];

/**
 * Historia raportów (PROMPT.md §10 „Historia raportów (paginacja po 20)”): tabela od 768 px (poniżej karty),
 * od najnowszego miesiąca, ze statusem raportu, datą wysłania i stanem linku; „Otwórz” prowadzi do edytora.
 * Bez raportów — pusty stan z drogą do panelu klientów.
 */
export function HistoryView({ data }: { data: HistoryPage }) {
  return (
    <div className={s.page}>
      <header className={s.intro}>
        <h1 id={HISTORY_HEADING_ID} tabIndex={-1} className={cx('heading-2', s.title)}>
          {t.heading}
        </h1>
        {data.total > 0 && <p className="sd-secondary">{t.lead(data.total)}</p>}
      </header>

      {data.total === 0 ? (
        <EmptyState
          title={t.empty.title}
          actions={
            <Link href="/app/klienci" className={buttonClass({ variant: 'primary', className: s.touch })}>
              {t.empty.action}
            </Link>
          }
        >
          {t.empty.body}
        </EmptyState>
      ) : (
        <>
          <DataTable caption={t.table.caption} columns={COLUMNS} rows={data.rows} rowKey={(row) => row.id} />
          <div className={s.footer}>
            <Pagination
              page={data.page}
              pageCount={data.pageCount}
              hrefFor={historyHref}
              label={t.pagination}
            />
          </div>
        </>
      )}
    </div>
  );
}

/** Lista się nie wczytała: przyczyna i naprawa (odświeżenie strony). */
export function HistoryLoadError({ page }: { page: number }) {
  return (
    <div className={s.page}>
      <h1 className={cx('heading-2', s.title)}>{t.heading}</h1>
      <Alert
        variant="error"
        title={t.loadError.title}
        actions={
          <a
            className={buttonClass({ size: 's', className: s.touch })}
            href={page > 1 ? historyHref(page) : HISTORY_PATH}
          >
            {t.loadError.retry}
          </a>
        }
      >
        {t.loadError.body}
      </Alert>
    </div>
  );
}

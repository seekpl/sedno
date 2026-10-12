import type { ReactNode } from 'react';
import { formatNumber } from '@/lib/i18n/pl';
import styles from './DataTable.module.css';

export type Column<Row> = {
  key: string;
  header: ReactNode;
  /** Nagłówek tylko dla czytników (np. kolumna z działaniami). */
  headerHidden?: boolean;
  /** Kolumna liczbowa: wyrównanie do prawej, Bricolage, brak danych jako „—”. */
  numeric?: boolean;
  value?: (row: Row) => number | null | undefined;
  render?: (row: Row) => ReactNode;
};

type DataTableProps<Row> = {
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  selectedKey?: string;
};

function cell<Row>(col: Column<Row>, row: Row): ReactNode {
  if (col.render) return col.render(row);
  if (col.value) return formatNumber(col.value(row));
  return null;
}

/** Tabela od 768 px (sd-table), poniżej karty (sd-card). Brak danych to „—”, nigdy 0. */
export function DataTable<Row>({ caption, columns, rows, rowKey, selectedKey }: DataTableProps<Row>) {
  const [first, ...rest] = columns;
  return (
    <>
      <div className={`sd-table-wrap ${styles.table}`}>
        <table className="sd-table">
          <caption className="sd-visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={col.numeric ? 'num' : undefined} scope="col">
                  {col.headerHidden ? <span className="sd-visually-hidden">{col.header}</span> : col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} aria-selected={selectedKey === rowKey(row) ? true : undefined}>
                {columns.map((col) => (
                  <td key={col.key} className={col.numeric ? 'num' : undefined}>
                    {cell(col, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={styles.cards} aria-label={caption}>
        {rows.map((row) => (
          <li key={rowKey(row)} className={`sd-card ${styles.card}`}>
            {first && <div className={styles.cardHead}>{cell(first, row)}</div>}
            <dl className={styles.list}>
              {rest
                .filter((col) => !col.headerHidden)
                .map((col) => (
                  <div key={col.key} className={styles.item}>
                    <dt className="sd-secondary">{col.header}</dt>
                    <dd className={col.numeric ? 'sd-num' : undefined}>{cell(col, row)}</dd>
                  </div>
                ))}
            </dl>
            {rest
              .filter((col) => col.headerHidden)
              .map((col) => (
                <div key={col.key} className={styles.actions}>
                  {cell(col, row)}
                </div>
              ))}
          </li>
        ))}
      </ul>
    </>
  );
}

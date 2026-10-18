import { Fragment, type CSSProperties } from 'react';
import { KeyNumber } from '@/components/ui/KeyNumber';
import { Logo } from '@/components/ui/Logo';
import { Mark } from '@/components/ui/Mark';
import { Metric } from '@/components/ui/Metric';
import { report as reportCopy } from '@/lib/copy/report';
import { cx } from '@/lib/cx';
import { reportView, type MetricView } from '@/lib/report/format';
import type { ReportData } from '@/lib/report/types';
import { ReportShell } from './ReportShell';
import s from './Report.module.css';

type ReportProps = {
  data: ReportData;
  /** 1 na stronie raportu (/r/[token]), 2 tam, gdzie raport jest częścią innej strony (podgląd, przykład). */
  headingLevel?: 1 | 2;
  className?: string;
  /**
   * Adres logo autora z tej samej domeny (/app/logo w edytorze, /r/[token]/logo na raporcie publicznym).
   * Logo zastępuje awatar z inicjałami i nazwę (nazwa zostaje tekstem alternatywnym). Bez logo nagłówek
   * pokazuje nazwę i inicjały autora.
   */
  logoSrc?: string;
};

/**
 * Raport dla klienta w HTML (PROMPT.md §11): ten sam układ co PDF, kolejność stała (brand/docs/0-zasady-marki.md).
 * Dwa wyglądy z jednego markupu przez zapytania kontenera: wąski = telefon (EkranRaport.html), szeroki = arkusz A4.
 * Komponent serwerowy, bez stanu. Raport pisze bezosobowo — wszystkie teksty z lib/copy/report.ts.
 */
export function Report({ data, headingLevel = 1, className, logoSrc }: ReportProps) {
  const view = reportView(data);
  // Logo z konta (ta sama domena) ma pierwszeństwo przed adresem https zapisanym w danych.
  const logo = logoSrc ?? view.author.logoUrl;
  const Title = headingLevel === 1 ? 'h1' : 'h2';
  const Section = headingLevel === 1 ? 'h2' : 'h3';

  return (
    <ReportShell className={cx(s.shell, className)}>
      <article className={s.sheet}>
        <div className="sd-r-brand">
          <div className={s.author}>
            {logo ? (
              // Logo autora z jego konta. next/image wymagałby listy hostów; rozmiar ustala CSS (wysokość
              // awatara, szerokość najwyżej 160 px), więc szerokie albo wysokie logo nie rozpycha nagłówka.
              // eslint-disable-next-line @next/next/no-img-element
              <img className={s.logo} src={logo} alt={view.author.name || reportCopy.logoAlt} />
            ) : (
              view.author.initials && (
                <span className={cx('sd-avatar', s.avatar)} aria-hidden="true">
                  {view.author.initials}
                </span>
              )
            )}
            <div className={s.authorText}>
              {view.author.name && !logo && <div className={s.authorName}>{view.author.name}</div>}
              <div className={cx('sd-r-secondary', s.client)}>
                <span className={s.narrowOnly}>{view.forClient}</span>
                <span className={s.wideOnly}>{view.forClientLong}</span>
              </div>
            </div>
          </div>
          <div className={cx('sd-r-secondary', s.period)}>
            <span>{view.monthLabel}</span>
            <span className={cx('sd-num', s.wideOnly)}>{view.dateRangeShort}</span>
          </div>
        </div>

        <hr className={s.wideOnly} />

        <div>
          <p className={cx('sd-r-secondary', s.intro)}>{view.intro}</p>
          <Title className={cx('sd-r-title', s.title)}>{view.headline}</Title>
        </div>

        <div className={s.numbers}>
          {/* --key-em: szerokość liczby w em; CSS zmniejsza nią stopień, żeby długa liczba z pętlą się mieściła. */}
          <div className={s.keyBox} style={{ '--key-em': view.keyValueEm } as CSSProperties}>
            <KeyNumber
              icon={view.key.icon}
              label={view.key.label}
              value={view.key.value}
              delta={<Delta metric={view.key} />}
            />
          </div>
          <div className={s.metrics}>
            {view.metrics.map((m) => (
              <Metric
                key={m.key}
                className={s.metric}
                icon={m.icon}
                label={m.label}
                value={m.value}
                delta={<Delta metric={m} />}
              />
            ))}
          </div>
        </div>

        <hr className={s.narrowOnly} />

        {view.worked && (
          <section className={cx(s.section, s.prose)}>
            <Section className={s.heading}>{view.sections.worked}</Section>
            <p className={s.text}>
              {view.worked.map((segment, i) =>
                segment.marked ? (
                  <Mark key={i}>{segment.text}</Mark>
                ) : (
                  <Fragment key={i}>{segment.text}</Fragment>
                ),
              )}
            </p>
          </section>
        )}

        <section className={s.section}>
          <Section className={s.heading}>{view.sections.reach}</Section>
          <div className={cx('sd-r-bars', s.bars)}>
            {view.reach.map((row, i) => (
              <div key={i} className="sd-r-bar">
                <span className={row.previous ? 'sd-r-secondary' : undefined}>{row.label}</span>
                <i
                  className={row.previous ? 'prev' : undefined}
                  style={{ width: `${row.widthPercent}%` }}
                  aria-hidden="true"
                />
                <span className={cx('sd-num', row.previous && 'sd-r-secondary')}>
                  {row.value}
                  {row.change && (
                    <>
                      {' '}
                      <span className={cx('sd-r-secondary', s.change)}>{row.change}</span>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>

        {view.plan && (
          <section className={cx(s.section, s.prose)}>
            <Section className={s.heading}>{view.sections.plan}</Section>
            <p className={s.text}>{view.plan}</p>
          </section>
        )}

        <div className={s.foot}>
          <hr className={s.wideOnly} />
          <p className="sd-r-foot">
            {view.footnotes.map((note, i) => (
              <Fragment key={i}>
                {i > 0 && ' '}
                {note}
              </Fragment>
            ))}
          </p>
        </div>

        {view.showSednoFooter && (
          <div className={cx('sd-r-foot', s.footer)}>
            {view.footer} <Logo height={12} />
          </div>
        )}
      </article>
    </ReportShell>
  );
}

/** „sierpień: 17”, a przy wyświetleniach także „+9% m/m”. Spadek bez czerwieni i bez strzałek. */
function Delta({ metric }: { metric: MetricView }) {
  return (
    <>
      {metric.delta}
      {metric.change && (
        <>
          {' '}
          <span className={s.change}>{metric.change}</span>
        </>
      )}
    </>
  );
}

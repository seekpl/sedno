import type { Metadata } from 'next';
import Link from 'next/link';
import { PhoneFrame } from '@/components/report/PhoneFrame';
import { Report } from '@/components/report/Report';
import { ExampleNote } from '@/components/site/ExampleNote';
import { NotifyDisclosure } from '@/components/site/NotifyDisclosure';
import { PricingCard } from '@/components/site/PricingCard';
import { pageMetadata } from '@/components/site/seo';
import { ToolLink } from '@/components/site/ToolLink';
import { Badge } from '@/components/ui/Badge';
import { buttonClass } from '@/components/ui/buttonClass';
import { Circled } from '@/components/ui/Circled';
import { FileChip } from '@/components/ui/FileChip';
import { Icon } from '@/components/ui/Icon';
import { PRODUCT_NAME } from '@/config/brand';
import { templateUrl, waitlistEnabled } from '@/config/features';
import { formatPrice, PLANS, SINGLE_REPORT, VAT_RATE } from '@/config/pricing';
import { copy } from '@/lib/copy/pl';
import { cx } from '@/lib/cx';
import { lastFullMonth } from '@/lib/dates';
import { formatNumber, monthForms, plural } from '@/lib/i18n/pl';
import { EXAMPLE_REPORT } from '@/lib/report/example';
import type { ActionKey } from '@/lib/report/types';
import s from './page.module.css';

/**
 * Strona główna (PROMPT.md §12; brand/reference/screens/EkranLanding.html i EkranLandingMobile.html).
 * Statyczna, tylko jasna, bez JavaScriptu poza formularzem listy oczekujących (w natywnym <details>).
 * Faza 1 mówi tylko o tym, co działa: raport PDF bez konta (docs/decisions.md, p. 17).
 * Przyciski do narzędzia to ToolLink (zwykły <a>), żeby /nowy wczytał się z własną CSP.
 */

// Pas CTA podaje ostatni pełny miesiąc — strona odświeża się co godzinę i dalej jest statyczna.
export const revalidate = 3600;

export const metadata: Metadata = pageMetadata({
  path: '/',
  title: `${PRODUCT_NAME} — ${copy.meta.h1}`,
  absolute: true,
  description: copy.landing.seo.home.description,
});

const t = copy.landing;
const ACTIONS: readonly ActionKey[] = ['book', 'call', 'directions'];

/** Mianownik ostatniego pełnego miesiąca: „Zrób klientowi raport za wrzesień jeszcze dziś”. */
function ctaMonth(): string {
  return monthForms(lastFullMonth(new Date())).nom;
}

export default function Home() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <Effects />
      <BrandAndPrivacy />
      <Pricing notify={waitlistEnabled()} />
      <Faq />
      <Tools />
      <CtaBand month={ctaMonth()} />
    </>
  );
}

function Hero() {
  // Brak danych to „—”, nigdy 0 (CLAUDE.md, §14); forma „publikacji” pasuje też do „—”.
  const posts = EXAMPLE_REPORT.summary.posts;
  return (
    <section className={cx(s.container, s.hero)}>
      <div className={s.heroText}>
        <h1 className={cx('display-xl', s.heroTitle)}>{t.hero.h1}</h1>
        <p className={cx('body-l', 'sd-secondary', s.lead)}>{t.hero.lead}</p>
        <div className={s.ctas}>
          <ToolLink className={buttonClass({ variant: 'primary', size: 'l' })} src="hero">
            {copy.cta.primary}
          </ToolLink>
          <Link className={buttonClass({ size: 'l' })} href="/przyklad">
            {copy.cta.secondary}
          </Link>
        </div>
        <p className="sd-privacy">
          <Icon name="lock" size="s" />
          {t.hero.privacy}
        </p>
        {/* Trzy kroki przepływu: plik → trzy liczby → PDF (brand/docs/0-zasady-marki.md, „Motyw graficzny”). */}
        <div className={s.flow}>
          <ol className={s.flowSteps} aria-label={t.hero.flowLabel}>
            <li className={cx('sd-card', s.flowCard)}>
              <span className="caption sd-muted">{t.hero.flow.file.step}</span>
              <div className={s.flowFile}>
                <FileChip name={t.hero.flow.file.fileName} />
              </div>
              <Badge variant="success" icon="check" className={s.flowBadge}>
                <span className="sd-num">{formatNumber(posts)}</span>{' '}
                {plural(posts ?? Number.NaN, t.hero.flow.file.posts)}
              </Badge>
            </li>
            <li className={cx('sd-card', s.flowCard)}>
              <span className="caption sd-muted">{t.hero.flow.numbers.step}</span>
              <dl className={s.flowNumbers}>
                {ACTIONS.map((key) => (
                  <div key={key} className={s.flowNumber}>
                    <dt>{t.hero.flow.numbers.button(copy.report.actionShort(key))}</dt>
                    <dd className="sd-num sd-display">{formatNumber(EXAMPLE_REPORT.actions[key])}</dd>
                  </div>
                ))}
              </dl>
            </li>
            <li className={cx('sd-card', s.flowCard)}>
              <span className="caption sd-muted">{t.hero.flow.send.step}</span>
              {/* Ilustracja przycisku z narzędzia, nie działanie na tej stronie (stąd span i aria-hidden). */}
              <span className={buttonClass({ size: 's', className: s.flowButton })} aria-hidden="true">
                <Icon name="download" size="s" />
                {t.hero.flow.send.button}
              </span>
            </li>
          </ol>
          <ExampleNote />
        </div>
      </div>
      <div className={s.heroPhone}>
        <PhoneFrame label={t.hero.phoneLabel} className={s.phone}>
          <Report data={EXAMPLE_REPORT} headingLevel={2} />
        </PhoneFrame>
        <ExampleNote className={s.phoneNote} />
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="jak-to-dziala" className={s.band}>
      <div className={cx(s.container, s.how)}>
        <h2 className={cx('display-l', s.sectionTitle)}>{t.how.title}</h2>
        <ol className={s.steps}>
          {t.how.steps.map((step, i) => (
            <li key={step.title} className={s.step}>
              <span className={cx('sd-num', s.stepNumber)}>{i + 1}</span>
              <h3 className="heading-3">{step.title}</h3>
              <p className="sd-secondary">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Effects() {
  const { typical, sedno } = t.effects;
  return (
    <section className={cx(s.container, s.effects)}>
      <div className={s.effectsText}>
        <h2 className={cx('display-l', s.sectionTitle)}>{t.effects.title}</h2>
        <p className="body-l sd-secondary">{t.effects.body}</p>
      </div>
      <div className={s.compare}>
        <div className={cx('sd-card', s.compareCard)}>
          <span className="caption sd-muted">{typical.label}</span>
          {typical.rows.map((row) => (
            <p key={row.label}>
              {row.label}: <b className="sd-num">{formatNumber(row.value)}</b>
            </p>
          ))}
          <p>
            {typical.engagementLabel}: <b className="sd-num">{typical.engagement}</b>
          </p>
          <ExampleNote className={s.compareNote} />
        </div>
        <div className={cx('sd-card', s.compareCard, s.compareSedno)}>
          <span className="caption sd-muted">{sedno.label}</span>
          <p className={cx('sd-num', s.sednoValue)}>
            <Circled>{formatNumber(sedno.value)}</Circled>
          </p>
          <p>{sedno.caption}</p>
          <p className={cx('sd-secondary', s.sednoRest)}>{sedno.rest}</p>
          <ExampleNote className={s.compareNote} />
        </div>
      </div>
    </section>
  );
}

function BrandAndPrivacy() {
  return (
    <section className={cx(s.container, s.infoCards)}>
      <div className={cx('sd-card', s.infoCard)}>
        <div className={s.infoHead}>
          <h2 className="heading-2">{t.brand.title}</h2>
          <Badge>{t.brand.badge}</Badge>
        </div>
        <p className="sd-secondary">{t.brand.body}</p>
      </div>
      <div className={cx('sd-card', s.infoCard)}>
        <h2 className={cx('heading-2', s.iconTitle)}>
          <Icon name="lock" size="l" />
          {t.privacy.title}
        </h2>
        <p className="sd-secondary">{t.privacy.body}</p>
      </div>
    </section>
  );
}

/** „netto / miesiąc · do 10 klientów” — kwota i limit z config/pricing.ts. */
function planCaption(clients: number): string {
  return `${t.pricing.perMonth}${t.pricing.separator}${t.pricing.clients(clients)}`;
}

function Pricing({ notify }: { notify: boolean }) {
  return (
    <section id="cennik" className={s.band}>
      <div className={cx(s.container, s.pricing)}>
        <div className={s.sectionHead}>
          <h2 className={cx('display-l', s.sectionTitle)}>{t.pricing.title}</h2>
          <p className="body-l sd-secondary">
            {t.pricing.lead} {t.pricing.now}
          </p>
        </div>
        <div className={s.plans}>
          {/* Wyróżniony jest plan, który działa dziś; „Najczęściej wybierany” byłby zmyśloną daną (zasada 6). */}
          <PricingCard
            name={PLANS.free.name}
            price={formatPrice(PLANS.free.netMonthly)}
            caption={t.pricing.free.caption}
            features={t.pricing.free.features}
            highlighted
          >
            <ToolLink className={buttonClass({ variant: 'primary', block: true })} src="pricing">
              {t.pricing.free.cta}
            </ToolLink>
          </PricingCard>
          <PricingCard
            name={PLANS.solo.name}
            price={formatPrice(PLANS.solo.netMonthly)}
            caption={planCaption(PLANS.solo.clients)}
            features={t.pricing.solo.features}
            badge={t.pricing.soon}
          >
            {notify && <NotifyDisclosure plan="solo" />}
          </PricingCard>
          <PricingCard
            name={PLANS.studio.name}
            price={formatPrice(PLANS.studio.netMonthly)}
            caption={planCaption(PLANS.studio.clients)}
            features={t.pricing.studio.features}
            badge={t.pricing.soon}
          >
            {notify && <NotifyDisclosure plan="studio" />}
          </PricingCard>
        </div>
        <div className={s.pricingNotes}>
          <p className="sd-secondary">{t.pricing.single(formatPrice(SINGLE_REPORT.netPrice))}</p>
          <p className="caption sd-muted">{t.pricing.footnote(Math.round(VAT_RATE * 100))}</p>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className={cx(s.container, s.faq)}>
      <div className={s.faqHead}>
        <h2 className={cx('display-l', s.sectionTitle)}>{t.faq.title}</h2>
        <p className="sd-secondary">
          {t.faq.contactLead}{' '}
          <Link className={cx('sd-link', s.contactLink)} href="/kontakt">
            {t.faq.contactLink}
          </Link>
        </p>
      </div>
      <div className={s.faqList}>
        {t.faq.items.map((item, i) => (
          <details key={item.q} className={cx('sd-card', s.faqItem)} open={i === 0}>
            <summary className={s.faqQuestion}>{item.q}</summary>
            <p className={cx('sd-secondary', s.faqAnswer)}>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Tools() {
  return (
    <section id="narzedzia" className={cx(s.container, s.tools)}>
      <h2 className="heading-1">{t.tools.title}</h2>
      <div className={s.toolsGrid}>
        <div className={cx('sd-card', s.toolCard)}>
          {templateUrl ? (
            <Badge variant="success" icon="check">
              {t.tools.available}
            </Badge>
          ) : (
            <Badge>{t.tools.soon}</Badge>
          )}
          <h3 className="heading-3">{t.tools.template.title}</h3>
          <p className="sd-secondary">{t.tools.template.body}</p>
          {templateUrl && (
            <a className={cx('sd-link', s.toolLink)} href={templateUrl} rel="noopener noreferrer">
              {t.tools.template.link}
            </a>
          )}
        </div>
        <div className={cx('sd-card', s.toolCard)}>
          <Badge>{t.tools.soon}</Badge>
          <h3 className="heading-3">{t.tools.calculator.title}</h3>
          <p className="sd-secondary">{t.tools.calculator.body}</p>
        </div>
      </div>
    </section>
  );
}

function CtaBand({ month }: { month: string }) {
  return (
    <section className={s.ctaBand}>
      <div className={cx(s.container, s.ctaBandInner)}>
        <h2 className={cx('display-l', s.sectionTitle, s.ctaTitle)}>{t.ctaBand.title(month)}</h2>
        <ToolLink className={buttonClass({ variant: 'primary', size: 'l' })} src="cta-band">
          {copy.cta.primary}
        </ToolLink>
      </div>
    </section>
  );
}

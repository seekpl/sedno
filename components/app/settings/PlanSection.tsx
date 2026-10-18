import { Badge } from '@/components/ui/Badge';
import { formatPrice, PLANS } from '@/config/pricing';
import { settings } from '@/lib/copy/settings';
import { cx } from '@/lib/cx';
import type { Plan } from '@/lib/data/profile';
import s from './Settings.module.css';

const t = settings.plan;

/**
 * „Plan” (karta „Twój plan” i karta Solo jak w EkranCennik.html). Faza 2: bez płatności i bez ograniczeń
 * planu (docs/decisions.md, p. 94), więc Solo ma tylko cenę z config/pricing.ts i plakietkę „Wkrótce” —
 * bez przycisku zakupu. Ceny wyłącznie z config/pricing.ts.
 */
export function PlanSection({ plan, headingId }: { plan: Plan; headingId: string }) {
  const current = PLANS[plan];
  const solo = PLANS.solo;
  return (
    <section className={s.planCards} aria-labelledby={headingId}>
      <div className={cx('sd-card', s.card)}>
        <div className={s.cardHead}>
          <h2 id={headingId} className="heading-3">
            {t.current(current.name)}
          </h2>
          <Badge>
            <span className="sd-num">{formatPrice(current.netMonthly)}</span>
          </Badge>
        </div>
        <p className="sd-secondary">{plan === 'free' ? t.free : t.solo}</p>
      </div>
      {plan === 'free' && (
        <div className={cx('sd-card', s.card)}>
          <div className={s.cardHead}>
            <h3 className="heading-3">{solo.name}</h3>
            <Badge>{t.soon}</Badge>
          </div>
          <div>
            <p className={cx('sd-num', s.price)}>{formatPrice(solo.netMonthly)}</p>
            <p className="caption sd-muted">
              {t.perMonth}
              {t.separator}
              {t.clients(solo.clients)}
            </p>
          </div>
          <p className="sd-secondary">{t.soloBody}</p>
        </div>
      )}
    </section>
  );
}

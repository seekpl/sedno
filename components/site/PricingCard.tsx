import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/lib/cx';
import s from './PricingCard.module.css';

type PricingCardProps = {
  /** Nazwa planu z config/pricing.ts. */
  name: string;
  /** Kwota sformatowana przez formatPrice() z config/pricing.ts — nigdy wpisana w tekst. */
  price: string;
  /** Podpis pod ceną: „netto / miesiąc · do 10 klientów”. */
  caption: string;
  features: readonly string[];
  /** Plakietka przy nazwie, np. „Wkrótce”. */
  badge?: string;
  /** Wyróżnienie obrysem pen — tylko plan, który działa dziś (jedno główne działanie). */
  highlighted?: boolean;
  /** Działanie pod listą: link do narzędzia albo „Powiadom mnie o starcie”. */
  children?: ReactNode;
};

/** Karta planu w cenniku (brand/reference/screens/EkranLanding.html, sekcja Cennik). */
export function PricingCard({
  name,
  price,
  caption,
  features,
  badge,
  highlighted,
  children,
}: PricingCardProps) {
  return (
    <div className={cx('sd-card', s.card, highlighted && s.highlighted)}>
      <div className={s.head}>
        <h3 className="heading-3">{name}</h3>
        {badge && <Badge>{badge}</Badge>}
      </div>
      <div className={s.priceBlock}>
        <p className={cx('sd-num', s.price)}>{price}</p>
        <p className="caption sd-muted">{caption}</p>
      </div>
      <ul className={s.features}>
        {features.map((feature) => (
          <li key={feature}>
            <Icon name="check" size="s" className={s.check} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      {children && <div className={s.action}>{children}</div>}
    </div>
  );
}

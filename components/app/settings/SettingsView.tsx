import { Alert } from '@/components/ui/Alert';
import { buttonClass } from '@/components/ui/buttonClass';
import { Icon } from '@/components/ui/Icon';
import { settings as t } from '@/lib/copy/settings';
import { cx } from '@/lib/cx';
import type { Profile } from '@/lib/data/profile';
import { DeleteAccount } from './DeleteAccount';
import { LogoSection } from './LogoSection';
import { PlanSection } from './PlanSection';
import { ProfileForm } from './ProfileForm';
import s from './Settings.module.css';

/** Adresy ekranu (kontrakt tras). */
export const SETTINGS_EXPORT_HREF = '/app/ustawienia/eksport';
export const SIGN_OUT_ACTION = '/auth/wyloguj';

const IDS = {
  heading: 'ustawienia',
  profile: 'ustawienia-profil',
  logo: 'ustawienia-logo',
  plan: 'ustawienia-plan',
  data: 'ustawienia-dane',
  delete: 'ustawienia-usun-konto',
  signOut: 'ustawienia-wylogowanie',
} as const;

/**
 * Ustawienia (PROMPT.md §10: profil i marka, plan i płatności, eksport i usunięcie danych; §15 RODO).
 * Karty sekcji jak w EkranCennik.html: od 1024 px dwie kolumny (profil i logo | plan, dane, konto).
 */
export function SettingsView({
  profile,
  email,
  logoVersion,
}: {
  profile: Profile;
  email: string | null;
  /** Znacznik wersji podglądu logo (adres /app/logo?v=…), żeby przeglądarka pokazała nowe logo. */
  logoVersion: string;
}) {
  return (
    <div className={s.page}>
      <h1 id={IDS.heading} className={cx('heading-2', s.title)} tabIndex={-1}>
        {t.heading}
      </h1>
      <div className={s.columns}>
        <div className={s.column}>
          <section className={cx('sd-card', s.card)} aria-labelledby={IDS.profile}>
            <h2 id={IDS.profile} className="heading-3">
              {t.profile.title}
            </h2>
            {email && <p className="sd-secondary">{t.profile.email(email)}</p>}
            <ProfileForm displayName={profile.displayName} brandName={profile.brandName} />
          </section>

          <section className={cx('sd-card', s.card)} aria-labelledby={IDS.logo}>
            <h2 id={IDS.logo} className={cx('heading-3', s.heading)} tabIndex={-1}>
              {t.logo.title}
            </h2>
            <p className="sd-secondary">{t.logo.lead}</p>
            <LogoSection hasLogo={profile.hasLogo} version={logoVersion} headingId={IDS.logo} />
          </section>
        </div>

        <div className={s.column}>
          <PlanSection plan={profile.plan} headingId={IDS.plan} />

          <section className={cx('sd-card', s.card)} aria-labelledby={IDS.data}>
            <h2 id={IDS.data} className="heading-3">
              {t.data.title}
            </h2>
            <p className="sd-secondary">{t.data.body}</p>
            <div>
              {/* Zwykły link (nie next/link): trasa zwraca plik do pobrania, bez prefetchu. */}
              <a className={buttonClass({ className: s.action })} href={SETTINGS_EXPORT_HREF} download>
                <Icon name="download" />
                {t.data.download}
              </a>
            </div>
          </section>

          <section className={cx('sd-card', s.card)} aria-labelledby={IDS.delete}>
            <h2 id={IDS.delete} className="heading-3">
              {t.deleteAccount.title}
            </h2>
            <p className="sd-secondary">{t.deleteAccount.body}</p>
            <div>
              <DeleteAccount className={s.action} />
            </div>
          </section>

          <section className={cx('sd-card', s.card)} aria-labelledby={IDS.signOut}>
            <h2 id={IDS.signOut} className="heading-3">
              {t.signOut.title}
            </h2>
            <p className="sd-secondary">{t.signOut.body}</p>
            <form method="post" action={SIGN_OUT_ACTION}>
              <button type="submit" className={buttonClass({ className: s.action })}>
                {t.signOut.button}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Profil się nie wczytał: przyczyna i naprawa (odświeżenie strony). */
export function SettingsLoadError() {
  return (
    <div className={s.page}>
      <h1 className={cx('heading-2', s.title)}>{t.heading}</h1>
      <Alert
        variant="error"
        title={t.loadError.title}
        actions={
          <a className={buttonClass({ size: 's' })} href="/app/ustawienia">
            {t.loadError.retry}
          </a>
        }
      >
        {t.loadError.body}
      </Alert>
    </div>
  );
}

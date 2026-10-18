import { Alert } from '@/components/ui/Alert';
import { buttonClass } from '@/components/ui/buttonClass';
import { editor as t } from '@/lib/copy/editor';
import { cx } from '@/lib/cx';
import s from './editor.module.css';

/** Błąd odczytu edytora z bazy: przyczyna i naprawa (odświeżenie tego samego adresu). Bez treści błędu bazy. */
export function EditorLoadError({ href }: { href: string }) {
  return (
    <div className={s.send}>
      <h1 className="heading-2">{t.meta.fallback}</h1>
      <Alert
        variant="error"
        title={t.loadError.title}
        actions={
          <a className={cx(buttonClass({}), s.touch)} href={href}>
            {t.loadError.retry}
          </a>
        }
      >
        {t.loadError.body}
      </Alert>
    </div>
  );
}

import { AppShell } from '@/components/app/AppShell';
import { Skeleton } from '@/components/ui/Skeleton';
import { editor } from '@/lib/copy/editor';
import s from './loading.module.css';

/** Ładowanie edytora: pasek aplikacji, szkielet nagłówka i kart (PROMPT.md §10 „Stany”), postęp słowem. */
export default function EditorLoading() {
  return (
    <AppShell current="klienci">
      <div className={s.loading}>
        <p className="sd-visually-hidden" role="status">
          {editor.loading}
        </p>
        <Skeleton width={80} height={14} />
        <Skeleton width="min(480px, 80%)" height={32} />
        <Skeleton width="min(420px, 70%)" height={24} />
        <Skeleton width="100%" height={240} />
        <Skeleton width="100%" height={180} />
      </div>
    </AppShell>
  );
}

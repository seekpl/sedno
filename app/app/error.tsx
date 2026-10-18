'use client';

import { useEffect, useRef } from 'react';
import { AppShell } from '@/components/app/AppShell';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { app as t } from '@/lib/copy/app';
import s from './error.module.css';

/**
 * Granica błędu obszaru konta: wyjątek przy renderze albo odrzucona akcja formularza (np. zerwane
 * połączenie na telefonie) nie zastępuje strony domyślnym błędem Next.js. Pasek aplikacji zostaje, komunikat
 * mówi przyczynę i naprawę, bez szczegółów błędu na ekranie.
 */
export default function AccountError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <AppShell current={null}>
      <div className={s.wrap}>
        <h1 ref={heading} tabIndex={-1} className="heading-2">
          {t.error.heading}
        </h1>
        <Alert
          variant="error"
          title={t.error.title}
          actions={
            <Button variant="primary" onClick={() => retry()}>
              {t.error.retry}
            </Button>
          }
        >
          {t.error.body}
        </Alert>
      </div>
    </AppShell>
  );
}

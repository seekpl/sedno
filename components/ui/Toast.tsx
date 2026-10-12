'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Button } from './Button';
import { Icon } from './Icon';
import styles from './Toast.module.css';

type ToastAction = { label: string; onClick: () => void };

type ToastViewProps = {
  message: ReactNode;
  variant?: 'success' | 'error';
  action?: ToastAction;
};

/** Sam wygląd powiadomienia (sd-toast). `live={false}`, gdy ogłasza je otaczający region aria-live. */
export function ToastView({
  message,
  variant = 'success',
  action,
  live = true,
}: ToastViewProps & { live?: boolean }) {
  return (
    <div
      className={cx('sd-toast', variant === 'error' && 'sd-toast--error')}
      role={live ? (variant === 'error' ? 'alert' : 'status') : undefined}
    >
      <Icon name={variant === 'error' ? 'error' : 'check'} />
      <span>{message}</span>
      {action && (
        <Button variant="ghost" size="s" className="sd-toast__action" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

type ToastItem = ToastViewProps & { id: number; duration: number };
type ShowToast = (toast: ToastViewProps & { duration?: number }) => void;

const ToastContext = createContext<ShowToast | null>(null);

/** Kolejka powiadomień. Powiadomienie z działaniem (np. „Cofnij”) zostaje dłużej. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback<ShowToast>(({ duration, ...toast }) => {
    const id = nextId.current++;
    setItems((all) => [
      ...all.slice(-2),
      { ...toast, id, duration: duration ?? (toast.action ? 8000 : 5000) },
    ]);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={styles.region} aria-live="polite">
        {items.map((t) => (
          <TimedToast key={t.id} item={t} onDone={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function TimedToast({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, item.duration);
    return () => window.clearTimeout(timer);
  }, [item.duration, onDone]);
  const action = item.action && {
    label: item.action.label,
    onClick: () => {
      item.action!.onClick();
      onDone();
    },
  };
  return <ToastView message={item.message} variant={item.variant} action={action} live={false} />;
}

export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast wymaga ToastProvider');
  return show;
}

import { ToastProvider } from '@/components/ui/Toast';
import s from './layout.module.css';

/** Narzędzie /nowy: zawsze jasne jak makiety ekranów; powiadomienia (Toast) tylko tutaj (docs/decisions.md, p. 11). */
export default function NewReportLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="light" className={s.tool}>
      <ToastProvider>{children}</ToastProvider>
    </div>
  );
}

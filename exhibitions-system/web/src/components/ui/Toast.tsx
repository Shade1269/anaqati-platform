import { CheckCircle2, XCircle, Info } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastCtx {
  toast: (message: string, kind?: ToastKind) => void;
  success: (m: string) => void;
  error: (m: string) => void;
}

const Ctx = createContext<ToastCtx | undefined>(undefined);

const styles: Record<ToastKind, string> = {
  success: 'border-success/40 text-success',
  error: 'border-danger/40 text-danger',
  info: 'border-info/40 text-info',
};

const icons: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 size={18} />,
  error: <XCircle size={18} />,
  info: <Info size={18} />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, message }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4200);
  }, []);

  const success = useCallback((m: string) => toast(m, 'success'), [toast]);
  const error = useCallback((m: string) => toast(m, 'error'), [toast]);

  return (
    <Ctx.Provider value={{ toast, success, error }}>
      {children}
      <div className="fixed left-1/2 top-5 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            className={`ax-card animate-toast flex items-center gap-3 border px-4 py-3 text-sm font-semibold ${styles[t.kind]}`}
          >
            {icons[t.kind]}
            <span className="text-text">{t.message}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast must be used within ToastProvider');
  return c;
}

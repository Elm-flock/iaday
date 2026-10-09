'use client';

import { X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { toneStyles, type AlertTone } from './alert';
import { IconButton } from './icon-button';

type ToastItem = { id: number; tone: AlertTone; message: string };

type ToastApi = {
  show: (message: string, tone?: AlertTone) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}

export const TOAST_DURATION_MS = 5000;
/** Máximo de toasts visibles a la vez: se descartan los más viejos. */
export const MAX_VISIBLE_TOASTS = 3;

/**
 * Un toast. Se cierra solo a los 5 s; el temporizador se pausa mientras el puntero está encima
 * o el foco está adentro (para poder leerlo / llegar al botón de cierre) y retoma con lo que faltaba.
 */
function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const { id, tone, message } = item;
  const [paused, setPaused] = useState(false);
  const remaining = useRef(TOAST_DURATION_MS);

  useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => onDismiss(id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [paused, id, onDismiss]);

  const { box, icon, Icon } = toneStyles[tone];
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        'pointer-events-auto flex items-center gap-s10 rounded-md border bg-surface-raised p-s10 pl-s15 text-body text-ink shadow-overlay animate-[fk-pop_180ms_ease-out]',
        box.split(' ')[0],
      )}
    >
      <Icon size={20} strokeWidth={1.75} aria-hidden="true" className={cn('shrink-0', icon)} />
      <p className="flex-1">{message}</p>
      <IconButton aria-label="Cerrar notificación" onClick={() => onDismiss(id)}>
        <X size={18} strokeWidth={1.75} aria-hidden="true" />
      </IconButton>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message: string, tone: AlertTone = 'success') => {
    const id = nextId.current++;
    setToasts((list) => [...list, { id, tone, message }].slice(-MAX_VISIBLE_TOASTS));
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext value={api}>
      {children}
      <div
        role="region"
        aria-label="Notificaciones"
        // Abajo a la izquierda y sin capturar clics fuera de cada toast: no tapa los botones de las
        // vistas ni los pies de los modales (que se alinean a la derecha).
        className="pointer-events-none fixed bottom-s20 left-s20 z-[100] flex w-[min(24rem,calc(100vw-2.5rem))] flex-col gap-s10"
      >
        {toasts.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext>
  );
}

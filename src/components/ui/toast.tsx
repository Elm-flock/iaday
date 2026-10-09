'use client';

import { X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
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

const DURATION_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, tone: AlertTone = 'success') => {
      const id = nextId.current++;
      setToasts((list) => [...list, { id, tone, message }]);
      setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext value={api}>
      {children}
      <div
        role="region"
        aria-label="Notificaciones"
        aria-live="polite"
        className="pointer-events-none fixed right-s20 bottom-s20 z-[100] flex w-[min(24rem,calc(100vw-2.5rem))] flex-col gap-s10"
      >
        {toasts.map(({ id, tone, message }) => {
          const { box, icon, Icon } = toneStyles[tone];
          return (
            <div
              key={id}
              className={cn(
                'pointer-events-auto flex items-center gap-s10 rounded-md border bg-surface-raised p-s10 pl-s15 text-body text-ink shadow-overlay animate-[fk-pop_180ms_ease-out]',
                box.split(' ')[0],
              )}
            >
              <Icon
                size={20}
                strokeWidth={1.75}
                aria-hidden="true"
                className={cn('shrink-0', icon)}
              />
              <p className="flex-1">{message}</p>
              <IconButton aria-label="Cerrar notificación" onClick={() => dismiss(id)}>
                <X size={18} strokeWidth={1.75} aria-hidden="true" />
              </IconButton>
            </div>
          );
        })}
      </div>
    </ToastContext>
  );
}

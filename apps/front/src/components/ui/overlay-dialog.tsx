'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { IconButton } from './icon-button';

export type OverlayDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Descripción opcional, enlazada con aria-describedby. */
  description?: string;
  children?: ReactNode;
  /** Botones de acción (la primaria al final). */
  footer?: ReactNode;
  /** Rol del diálogo: `alertdialog` para confirmaciones destructivas. */
  role?: 'dialog' | 'alertdialog';
  /** Clases de posición/tamaño del panel. */
  panelClassName: string;
};

const FOCUSABLE =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Foco inicial: `showModal()` enfoca el primer elemento enfocable, que es el botón "Cerrar" del encabezado
 * (con su tooltip). Mejor mover el foco a lo que la persona viene a hacer: el primer campo del contenido o,
 * si no hay (confirmaciones), el primer botón del pie, que es "Cancelar" (la opción segura).
 */
function focusInitial(dialog: HTMLDialogElement) {
  const target =
    dialog.querySelector<HTMLElement>('[autofocus]') ??
    dialog.querySelector<HTMLElement>(`[data-dialog-body] :is(${FOCUSABLE})`) ??
    dialog.querySelector<HTMLElement>(`[data-dialog-footer] :is(${FOCUSABLE})`);
  target?.focus();
}

/**
 * Base de Modal y Drawer sobre `<dialog>` nativo: `showModal()` aporta focus trap, `inert` del resto,
 * Esc y aria-modal implícito. Click en el backdrop cierra.
 */
export function OverlayDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  role = 'dialog',
  panelClassName,
}: OverlayDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      focusInitial(dialog);
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      role={role}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        'm-0 border border-border bg-surface-raised p-0 text-ink shadow-overlay backdrop:bg-brand-night/60',
        panelClassName,
      )}
    >
      <div className="flex max-h-full min-h-0 flex-col">
        <header className="flex items-start justify-between gap-s10 p-s20 pb-s10">
          <div className="flex flex-col gap-s5">
            <h2 id={titleId} className="text-heading-2 font-light tracking-heading">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="text-body text-ink-muted">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton
            aria-label="Cerrar"
            tooltipAlign="end"
            onClick={onClose}
            className="-mt-s5 -mr-s10"
          >
            <X size={20} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
        </header>
        {children ? (
          <div data-dialog-body className="min-h-0 flex-1 overflow-y-auto px-s20 py-s10">
            {children}
          </div>
        ) : null}
        {footer ? (
          <footer data-dialog-footer className="flex justify-end gap-s10 p-s20 pt-s15">
            {footer}
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}

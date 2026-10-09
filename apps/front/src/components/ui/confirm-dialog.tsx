'use client';

import { Button } from './button';
import { OverlayDialog } from './overlay-dialog';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  /** Verbo + objeto, explícito: "Eliminar partner". Nunca "OK" ni "Aceptar". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Acción destructiva: botón de peligro. */
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  tone = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <OverlayDialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      role="alertdialog"
      panelClassName="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg open:animate-[fk-pop_180ms_ease-out]"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={tone} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

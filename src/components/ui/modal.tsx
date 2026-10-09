'use client';

import { OverlayDialog, type OverlayDialogProps } from './overlay-dialog';

type ModalProps = Omit<OverlayDialogProps, 'panelClassName' | 'role'>;

/** Ventana modal para 1–5 campos. Cierra con Esc, botón Cerrar o click en el fondo. */
export function Modal(props: ModalProps) {
  return (
    <OverlayDialog
      {...props}
      panelClassName="m-auto w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100vh-4rem)] rounded-lg open:animate-[fk-pop_180ms_ease-out]"
    />
  );
}

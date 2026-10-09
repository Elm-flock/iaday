'use client';

import { OverlayDialog, type OverlayDialogProps } from './overlay-dialog';

type DrawerProps = Omit<OverlayDialogProps, 'panelClassName' | 'role'>;

/** Panel lateral derecho para ver o editar sin perder la lista. */
export function Drawer(props: DrawerProps) {
  return (
    <OverlayDialog
      {...props}
      panelClassName="ml-auto h-dvh max-h-dvh w-[min(30rem,100vw)] rounded-l-lg rounded-r-none open:animate-[fk-slide_200ms_ease-out]"
    />
  );
}

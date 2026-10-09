'use client';

import { RefreshCw } from 'lucide-react';
import { useCallback, useState } from 'react';
import { CheckInDrawer } from './check-in-drawer';
import type { CheckInTarget } from './check-in-target';
import { Button } from '@/components/ui/button';

type Props = {
  target: CheckInTarget;
  /** Sin permiso: el botón queda deshabilitado y apunta a la razón visible (`aria-describedby`). */
  disabledReasonId?: string;
  disabled?: boolean;
};

/** "Registrar check-in" de un KR: abre el drawer. Hoja cliente. */
export function RegisterCheckInButton({ target, disabled = false, disabledReasonId }: Props) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon={<RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />}
        disabled={disabled}
        aria-describedby={disabled ? disabledReasonId : undefined}
        aria-label={`Registrar check-in de ${target.title}`}
        onClick={() => setOpen(true)}
      >
        Registrar check-in
      </Button>
      {open ? <CheckInDrawer target={target} onClose={close} /> : null}
    </>
  );
}

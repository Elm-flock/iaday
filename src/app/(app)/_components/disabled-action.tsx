import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

type DisabledActionProps = {
  label: string;
  /** Por qué no está disponible: visible, no solo en un tooltip. */
  reason: string;
  icon?: ReactNode;
  id: string;
};

/** Acción sin permiso: deshabilitada y con la explicación a la vista. */
export function DisabledAction({ label, reason, icon, id }: DisabledActionProps) {
  const reasonId = `${id}-reason`;
  return (
    <div className="flex flex-col items-end gap-s5">
      <Button disabled aria-describedby={reasonId} icon={icon}>
        {label}
      </Button>
      <span id={reasonId} className="text-caption text-ink-muted">
        {reason}
      </span>
    </div>
  );
}

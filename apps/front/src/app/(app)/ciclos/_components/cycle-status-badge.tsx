import { Lock } from 'lucide-react';
import { CYCLE_STATUS_LABEL } from '../messages';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tag } from '@/components/ui/tag';
import type { components } from '@/lib/api/schema';

type Status = components['schemas']['CycleDto']['status'];

/** Estado del ciclo: ícono + palabra (el color nunca va solo). */
export function CycleStatusBadge({ status }: { status: Status }) {
  if (status === 'CLOSED') {
    return (
      <Tag className="gap-s5">
        <Lock size={14} strokeWidth={1.75} aria-hidden="true" />
        {CYCLE_STATUS_LABEL.CLOSED}
      </Tag>
    );
  }
  return (
    <StatusBadge tone={status === 'ACTIVE' ? 'success' : 'info'}>
      {CYCLE_STATUS_LABEL[status]}
    </StatusBadge>
  );
}

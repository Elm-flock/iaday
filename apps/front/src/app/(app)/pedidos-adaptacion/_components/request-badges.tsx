import { STATUS_LABEL, STATUS_TONE } from '../messages';
import { StatusBadge } from '@/components/ui/status-badge';
import type { AdaptationStatus } from '@/lib/dal/adaptation-requests';

/** Estado del pedido: ícono + palabra (nunca solo color). */
export function RequestStatusBadge({ status }: { status: AdaptationStatus }) {
  return <StatusBadge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusBadge>;
}

/** "Vencido": el pedido sigue abierto y pasó su fecha límite. Ícono de alerta + palabra. */
export function RequestOverdueBadge() {
  return <StatusBadge tone="warning">Vencido</StatusBadge>;
}

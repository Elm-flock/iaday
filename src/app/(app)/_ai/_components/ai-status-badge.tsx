import { BadgeCheck, Sparkles, TriangleAlert, type LucideIcon } from 'lucide-react';
import { AI_STATUS_LABEL } from '../messages';
import { toneStyles, type AlertTone } from '@/components/ui/alert';
import { cn } from '@/lib/cn';

export type AdaptationStatus = keyof typeof AI_STATUS_LABEL;

const CONFIG: Record<AdaptationStatus, { tone: AlertTone; Icon: LucideIcon }> = {
  DRAFT: { tone: 'info', Icon: Sparkles },
  ACCEPTED: { tone: 'info', Icon: Sparkles },
  VALIDATED: { tone: 'success', Icon: BadgeCheck },
  NEEDS_REVIEW: { tone: 'warning', Icon: TriangleAlert },
};

/**
 * Estado de una versión generada por IA: ícono + palabra (nunca solo color). Transparencia (RD 707/2026):
 * mientras nadie la valide, se dice que la generó una IA y que está pendiente de validación.
 */
export function AiStatusBadge({
  status,
  className,
}: {
  status: AdaptationStatus;
  className?: string;
}) {
  const { tone, Icon } = CONFIG[status];
  const { box, icon } = toneStyles[tone];
  return (
    <span
      data-ai-status={status}
      className={cn(
        'inline-flex min-h-6 items-center gap-s5 rounded-pill border px-s10 py-px text-caption font-normal text-ink',
        box,
        className,
      )}
    >
      <Icon size={14} strokeWidth={1.75} aria-hidden="true" className={cn('shrink-0', icon)} />
      {AI_STATUS_LABEL[status]}
    </span>
  );
}

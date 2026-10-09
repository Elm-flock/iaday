import { CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { scoreBand, type ScoreBand } from '@/lib/score-band';
import { toneStyles, type AlertTone } from './alert';

const badgeBase =
  'inline-flex h-6 items-center gap-s5 rounded-pill border px-s10 text-caption font-normal whitespace-nowrap';

type StatusBadgeProps = {
  tone: AlertTone;
  /** Palabra de estado. El color nunca va solo: ícono + texto. */
  children: string;
  className?: string;
};

/** Estado genérico de un registro (ícono + palabra). */
export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  const { box, icon, Icon } = toneStyles[tone];
  return (
    <span className={cn(badgeBase, 'text-ink', box, className)}>
      <Icon size={14} strokeWidth={1.75} aria-hidden="true" className={icon} />
      {children}
    </span>
  );
}

export const bandConfig: Record<
  ScoreBand,
  { label: string; tone: 'success' | 'warning' | 'danger'; Icon: LucideIcon }
> = {
  'on-track': { label: 'En ruta', tone: 'success', Icon: CircleCheck },
  attention: { label: 'Requiere atención', tone: 'warning', Icon: TriangleAlert },
  'at-risk': { label: 'En riesgo', tone: 'danger', Icon: CircleAlert },
};

/** Badge de la banda de score OKR: verde 0.7+, amarillo 0.4–0.69, rojo < 0.4. */
export function BandBadge({ score, className }: { score: number; className?: string }) {
  const { label, tone, Icon } = bandConfig[scoreBand(score)];
  const { box, icon } = toneStyles[tone];
  return (
    <span data-band={scoreBand(score)} className={cn(badgeBase, 'text-ink', box, className)}>
      <Icon size={14} strokeWidth={1.75} aria-hidden="true" className={icon} />
      {label}
    </span>
  );
}

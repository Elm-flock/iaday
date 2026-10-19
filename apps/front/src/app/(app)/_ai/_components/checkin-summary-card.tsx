import { Minus, Sparkles, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { TREND_LABEL } from '../messages';
import type { CheckInSummary } from '../suggestion-payload';
import { Alert, toneStyles, type AlertTone } from '@/components/ui/alert';
import { cn } from '@/lib/cn';

const TREND: Record<CheckInSummary['trend'], { tone: AlertTone | 'neutral'; Icon: LucideIcon }> = {
  IMPROVING: { tone: 'success', Icon: TrendingUp },
  STABLE: { tone: 'neutral', Icon: Minus },
  DECLINING: { tone: 'warning', Icon: TrendingDown },
  INSUFFICIENT_DATA: { tone: 'neutral', Icon: Minus },
};

/** Tendencia con ícono + palabra (nunca solo color). */
export function TrendBadge({ trend }: { trend: CheckInSummary['trend'] }) {
  const { tone, Icon } = TREND[trend];
  const box = tone === 'neutral' ? 'border-border bg-surface-subtle' : toneStyles[tone].box;
  const icon = tone === 'neutral' ? 'text-ink-muted' : toneStyles[tone].icon;
  return (
    <span
      data-trend={trend}
      className={cn(
        'inline-flex h-6 items-center gap-s5 rounded-pill border px-s10 text-caption text-ink',
        box,
      )}
    >
      <Icon size={14} strokeWidth={1.75} aria-hidden="true" className={icon} />
      {TREND_LABEL[trend]}
    </span>
  );
}

/** Resumen del historial de un KR generado por IA. Presentacional: las acciones las pone quien lo use. */
export function CheckInSummaryCard({
  summary,
  needsHumanReview,
  children,
}: {
  summary: CheckInSummary;
  needsHumanReview: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      data-testid="checkin-summary"
      className="flex flex-col gap-s10 rounded-md border border-border bg-surface-subtle p-s15"
    >
      <div className="flex flex-wrap items-center gap-s10">
        <h5 className="text-body font-bold text-ink">Resumen de check-ins</h5>
        <span className="inline-flex min-h-6 items-center gap-s5 rounded-pill border border-info bg-info-subtle px-s10 text-caption text-ink">
          <Sparkles size={14} strokeWidth={1.75} aria-hidden="true" className="text-info" />
          Generado por IA
        </span>
        <TrendBadge trend={summary.trend} />
      </div>
      {needsHumanReview ? (
        <Alert tone="warning" title="Requiere revisión humana">
          Contrastalo con los check-ins antes de usarlo.
        </Alert>
      ) : null}
      <p className="whitespace-pre-line text-body text-ink">{summary.summary}</p>
      {summary.highlights.length > 0 ? (
        <div className="flex flex-col gap-s5">
          <h6 className="text-body-sm font-bold text-ink">Lo destacado</h6>
          <ul className="list-disc pl-s20 text-body-sm text-ink">
            {summary.highlights.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {summary.risks.length > 0 ? (
        <div className="flex flex-col gap-s5">
          <h6 className="text-body-sm font-bold text-ink">Riesgos y bloqueos</h6>
          <ul className="list-disc pl-s20 text-body-sm text-ink">
            {summary.risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {children}
    </div>
  );
}

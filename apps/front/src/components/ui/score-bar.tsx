import { cn } from '@/lib/cn';
import { formatScore } from '@/lib/format';
import { scoreBand, type ScoreBand } from '@/lib/score-band';

const fill: Record<ScoreBand, string> = {
  'on-track': 'bg-success',
  attention: 'bg-warning',
  'at-risk': 'bg-danger',
};

type ScoreBarProps = {
  /** Score 0.0–1.0. */
  score: number;
  /** Nombre accesible del medidor (p. ej. el título del KR). */
  label: string;
  className?: string;
};

export function ScoreBar({ score, label, className }: ScoreBarProps) {
  const clamped = Math.min(1, Math.max(0, score));
  return (
    <div className={cn('flex items-center gap-s10', className)}>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={clamped}
        aria-valuetext={formatScore(clamped)}
        className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-subtle"
      >
        <div
          className={cn(
            'h-full rounded-pill transition-[width] duration-200 ease-out',
            fill[scoreBand(clamped)],
          )}
          style={{ width: `${clamped * 100}%` }}
        />
      </div>
      <span className="w-10 text-right text-body-sm text-ink tabular-nums">
        {formatScore(clamped)}
      </span>
    </div>
  );
}

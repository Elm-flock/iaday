import type { ReactNode } from 'react';
import { CHECK_IN_ACTION_LABEL } from '../messages';
import { BandBadge } from '@/components/ui/status-badge';
import type { CheckIn } from '@/lib/dal/check-ins';
import { formatDateTime, formatNumber, formatScore } from '@/lib/format';

type Props = {
  checkIns: CheckIn[];
  /** Nombre de quien registró, por id de usuario. */
  names: Map<string, string>;
  unit: string | null;
  /** Ranura opcional bajo cada check-in (p. ej. la versión accesible). Mantiene este componente presentacional. */
  renderExtra?: (checkIn: CheckIn) => ReactNode;
};

const num = (value: string) => formatNumber(Number(value), Number.isInteger(Number(value)) ? 0 : 2);

/** Historial de un KR, del más nuevo al más viejo. Presentacional. */
export function CheckInTimeline({ checkIns, names, unit, renderExtra }: Props) {
  if (checkIns.length === 0) {
    return <p className="text-body-sm text-ink-muted">Todavía no hay check-ins.</p>;
  }
  return (
    <ol className="flex flex-col border-l border-border pl-s15">
      {checkIns.map((c) => (
        <li key={c.id} className="relative flex flex-col gap-s5 pb-s15 last:pb-0">
          <span
            aria-hidden="true"
            className="absolute top-s5 -left-[1.28rem] size-2 rounded-pill bg-border-strong"
          />
          <div className="flex flex-wrap items-center gap-s10 text-body-sm text-ink-muted">
            <time dateTime={c.createdAt}>{formatDateTime(c.createdAt)}</time>
            <span>·</span>
            <span>{names.get(c.authorId) ?? 'Alguien del equipo'}</span>
            <span>·</span>
            <span className="text-ink">{CHECK_IN_ACTION_LABEL[c.action]}</span>
          </div>
          <div className="flex flex-wrap items-center gap-s10 text-body-sm text-ink">
            {c.value !== null ? (
              <span className="tabular-nums">
                {num(c.value)}
                {unit ? ` ${unit}` : ''} →
              </span>
            ) : null}
            <span className="tabular-nums">Score {formatScore(c.score)}</span>
            <BandBadge score={c.score} />
          </div>
          {c.note ? <p className="whitespace-pre-line text-body-sm text-ink">{c.note}</p> : null}
          {renderExtra?.(c)}
        </li>
      ))}
    </ol>
  );
}

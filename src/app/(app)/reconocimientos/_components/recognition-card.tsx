import { ArrowRight, Target } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { BandBadge, StatusBadge } from '@/components/ui/status-badge';
import { formatDate, formatScore } from '@/lib/format';

export type CardMilestone =
  | { kind: 'kr'; title: string; objectiveTitle: string; score: number }
  | { kind: 'objective'; title: string; score: number }
  /** El logro enlazado ya no es visible para quien mira. */
  | { kind: 'unavailable' }
  | null;

type Props = {
  fromName: string;
  toName: string;
  message: string;
  createdAt: string;
  milestone: CardMilestone;
};

/** Reconocimiento del muro: quién → a quién, el hito (con banda y puntaje) y la fecha. Sin conteos ni rankings. */
export function RecognitionCard({ fromName, toName, message, createdAt, milestone }: Props) {
  return (
    <article className="rounded-lg border border-border bg-surface p-s20 shadow-sm">
      <header className="flex flex-wrap items-center gap-s10">
        <Avatar name={fromName} />
        <p className="flex flex-wrap items-center gap-s10 text-body text-ink">
          <span className="font-bold">{fromName}</span>
          <ArrowRight
            size={16}
            strokeWidth={1.75}
            aria-label="reconoció a"
            className="text-ink-muted"
          />
          <Avatar name={toName} />
          <span className="font-bold">{toName}</span>
        </p>
        <time dateTime={createdAt} className="ml-auto text-caption text-ink-muted">
          {formatDate(createdAt)}
        </time>
      </header>
      <p className="mt-s15 text-body whitespace-pre-wrap text-ink">{message}</p>
      {milestone ? (
        <div
          data-testid="recognition-milestone"
          className="mt-s15 flex flex-wrap items-center gap-s10 rounded-md border border-border bg-surface-subtle px-s15 py-s10 text-body-sm text-ink"
        >
          <Target size={16} strokeWidth={1.75} aria-hidden="true" className="text-ink-muted" />
          {milestone.kind === 'unavailable' ? (
            <span className="text-ink-muted">El logro enlazado ya no está disponible.</span>
          ) : (
            <>
              <span>
                {milestone.kind === 'kr'
                  ? `Resultado clave: ${milestone.title} (${milestone.objectiveTitle})`
                  : `Objetivo cerrado: ${milestone.title}`}
              </span>
              {milestone.kind === 'kr' ? (
                <BandBadge score={milestone.score} />
              ) : (
                <StatusBadge tone="success">Cerrado</StatusBadge>
              )}
              <span className="text-ink-muted">Puntaje {formatScore(milestone.score)}</span>
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}

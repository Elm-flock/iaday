import { Plus, Target } from 'lucide-react';
import NextLink from 'next/link';
import {
  hasScore,
  ObjectiveProgressBadge,
  objectiveProgressState,
} from '../../objetivos/_components/progress-badge';
import { buttonStyles } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ScoreBar } from '@/components/ui/score-bar';
import { StatusBadge } from '@/components/ui/status-badge';
import type { Objective } from '@/lib/dal/objectives';

export type MyObjectivesCardProps = {
  individual: Objective[];
  team: { teamName: string; objectives: Objective[] }[];
  cycleId: string;
  /** Esta card tiene la acción primaria (solo si no hay check-ins vencidos y no hay objetivos propios). */
  primaryCreate: boolean;
};

function ObjectiveRow({ objective }: { objective: Objective }) {
  const total = objective.keyResults.length;
  const withCheckIn = objective.keyResults.filter((kr) => kr.hasCheckIns).length;
  const draft = objective.status === 'DRAFT';
  return (
    <li>
      <NextLink
        href={`/objetivos/${objective.id}`}
        className="flex flex-col gap-s10 rounded-md border border-border bg-surface p-s15 transition-colors duration-150 hover:border-border-strong hover:bg-surface-subtle"
      >
        <span className="text-body font-bold text-ink">{objective.title}</span>
        {draft ? (
          <span className="flex flex-wrap items-center gap-s10 text-body-sm text-ink-muted">
            <StatusBadge tone="info">Borrador</StatusBadge>
            Todavía no tiene puntaje: publicalo cuando tenga entre 3 y 5 resultados clave.
          </span>
        ) : (
          <>
            <span className="flex flex-wrap items-center gap-s15">
              <ObjectiveProgressBadge objective={objective} />
              {hasScore(objectiveProgressState(objective)) ? (
                <ScoreBar
                  score={objective.score}
                  label={objective.title}
                  className="min-w-40 flex-1"
                />
              ) : null}
            </span>
            <span className="text-body-sm text-ink-muted">
              {withCheckIn} de {total} {total === 1 ? 'KR con check-in' : 'KRs con check-in'}
            </span>
          </>
        )}
      </NextLink>
    </li>
  );
}

/** "Mis objetivos": individuales y, en un grupo aparte, los de mis equipos. Presentacional. */
export function MyObjectivesCard({
  individual,
  team,
  cycleId,
  primaryCreate,
}: MyObjectivesCardProps) {
  const createHref = `/objetivos/nuevo?cycleId=${cycleId}`;
  return (
    <Card title="Mis objetivos" aria-label="Mis objetivos">
      {individual.length === 0 ? (
        <EmptyState
          icon={<Target size={32} strokeWidth={1.75} aria-hidden="true" />}
          title="Todavía no tenés objetivos en este ciclo"
          description="Definí entre 3 y 5 objetivos con sus resultados clave y publicalos para empezar a hacer check-ins."
          action={
            <NextLink
              href={createHref}
              className={buttonStyles({ variant: primaryCreate ? 'primary' : 'secondary' })}
            >
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
              Crear objetivo
            </NextLink>
          }
        />
      ) : (
        <section aria-label="Objetivos individuales">
          <ul className="flex flex-col gap-s10">
            {individual.map((o) => (
              <ObjectiveRow key={o.id} objective={o} />
            ))}
          </ul>
        </section>
      )}
      {team.map((group) => (
        <section
          key={group.teamName}
          aria-label={`Objetivos del equipo ${group.teamName}`}
          className="mt-s20"
        >
          <h4 className="mb-s10 text-body font-bold text-ink-muted">Equipo {group.teamName}</h4>
          <ul className="flex flex-col gap-s10">
            {group.objectives.map((o) => (
              <ObjectiveRow key={o.id} objective={o} />
            ))}
          </ul>
        </section>
      ))}
    </Card>
  );
}

import { Target } from 'lucide-react';
import NextLink from 'next/link';
import { BandBadge } from '@/components/ui/status-badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ScoreBar } from '@/components/ui/score-bar';
import type { Objective } from '@/lib/dal/objectives';
import { OBJECTIVE_MAX, OBJECTIVE_MIN } from '../messages';
import { ownerKey } from '../policy';
import { LimitIndicator, ObjectiveStatusBadge, ObjectiveTags } from './objective-meta';

export type OwnerGroup = {
  key: string;
  name: string;
  kind: 'user' | 'team';
  objectives: Objective[];
  /** Cantidad de objetivos que ocupan cupo (borrador + publicado) en el ciclo. */
  slots: number;
  /** El conteo es completo (la persona ve los borradores de este responsable). */
  exact: boolean;
};

/** Agrupa por responsable: equipos primero, después personas; cada grupo ordenado por título. */
export function groupByOwner(
  objectives: Objective[],
  ownerName: (key: string) => string,
  slotsByOwner: Map<string, number>,
  exactFor: (objective: Objective) => boolean,
): OwnerGroup[] {
  const groups = new Map<string, OwnerGroup>();
  for (const objective of objectives) {
    const key = ownerKey(objective);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: ownerName(key),
        kind: key.startsWith('team:') ? 'team' : 'user',
        objectives: [],
        slots: slotsByOwner.get(key) ?? 0,
        exact: exactFor(objective),
      };
      groups.set(key, group);
    }
    group.objectives.push(objective);
  }
  return [...groups.values()]
    .sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name, 'es') : a.kind === 'team' ? -1 : 1,
    )
    .map((g) => ({
      ...g,
      objectives: [...g.objectives].sort((a, b) => a.title.localeCompare(b.title, 'es')),
    }));
}

function ObjectiveCard({ objective }: { objective: Objective }) {
  const krs = objective.keyResults.length;
  return (
    <li>
      <NextLink
        href={`/objetivos/${objective.id}`}
        className="flex flex-col gap-s10 rounded-md border border-border bg-surface p-s15 transition-colors duration-150 hover:border-border-strong hover:bg-surface-subtle"
      >
        <span className="flex flex-wrap items-center gap-s10">
          <span className="flex-1 text-body font-bold text-ink">{objective.title}</span>
          <ObjectiveStatusBadge status={objective.status} />
        </span>
        <span className="flex flex-wrap items-center gap-s10">
          <ObjectiveTags objective={objective} />
          <span className="text-body-sm text-ink-muted">
            {krs} {krs === 1 ? 'resultado clave' : 'resultados clave'}
          </span>
        </span>
        {objective.status === 'DRAFT' ? (
          <span className="text-body-sm text-ink-muted">
            Borrador: todavía no tiene puntaje.
            {krs < 3 ? ` Necesita al menos 3 resultados clave para publicarse.` : ''}
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-s15">
            <BandBadge score={objective.score} />
            <ScoreBar score={objective.score} label={objective.title} className="min-w-40 flex-1" />
          </span>
        )}
      </NextLink>
    </li>
  );
}

/** Lista de objetivos agrupada por responsable, con el cupo (3 a 5) de cada uno. Presentacional. */
export function ObjectivesListView({
  groups,
  hasFilters,
}: {
  groups: OwnerGroup[];
  hasFilters: boolean;
}) {
  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<Target size={32} strokeWidth={1.75} aria-hidden="true" />}
        title={
          hasFilters
            ? 'No hay objetivos con estos filtros'
            : 'Todavía no hay objetivos en este ciclo'
        }
        description={
          hasFilters
            ? 'Probá con otro ciclo o quitá algún filtro para ver más resultados.'
            : `Cada persona define entre ${OBJECTIVE_MIN} y ${OBJECTIVE_MAX} objetivos por ciclo. Cuando haya objetivos, los vas a ver acá agrupados por responsable.`
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-s20">
      {groups.map((group) => (
        <Card
          key={group.key}
          title={group.kind === 'team' ? `${group.name} (equipo)` : group.name}
          actions={<LimitIndicator count={group.slots} exact={group.exact} />}
        >
          <ul className="flex flex-col gap-s10">
            {group.objectives.map((objective) => (
              <ObjectiveCard key={objective.id} objective={objective} />
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

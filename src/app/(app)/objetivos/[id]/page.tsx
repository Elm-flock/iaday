import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { KeyResultsCard } from '../_components/key-results-card';
import { ObjectiveActions } from '../_components/objective-actions';
import { ObjectiveDetailView } from '../_components/objective-detail-view';
import { KrHistoryCard } from '../../check-ins/_components/kr-history-card';
import { checkInAvailability } from '../../check-ins/policy';
import { canChangeKrTarget, canEditObjective } from '../policy';
import { PageSkeleton } from '../../_components/page-skeleton';
import { flattenTeams } from '../../equipos/team-tree';
import { PageHeader } from '@/components/ui/page-header';
import { listKrCheckIns } from '@/lib/dal/check-ins';
import { listCycles } from '@/lib/dal/cycles';
import { getObjective, listObjectives, type Objective } from '@/lib/dal/objectives';
import { getCurrentUser } from '@/lib/dal/session';
import { getTeamTree } from '@/lib/dal/teams';
import { listUsers } from '@/lib/dal/users';

export const metadata: Metadata = { title: 'Objetivo' };

type Params = Promise<{ id: string }>;

async function ObjectiveContent({ params }: { params: Params }) {
  const { id } = await params;

  // Todo en paralelo: el objetivo, la sesión, los directorios y los publicados (padre, hijos y candidatos a padre).
  const [objective, user, users, tree, cycles, published] = await Promise.all([
    getObjective(id),
    getCurrentUser(),
    listUsers(),
    getTeamTree(),
    listCycles(),
    listObjectives({ status: 'PUBLISHED' }),
  ]);
  if (!objective) notFound();

  const teams = flattenTeams(tree);
  const names = new Map([
    ...users.map((u) => [`user:${u.id}`, u.name] as const),
    ...teams.map((t) => [`team:${t.id}`, t.name] as const),
  ]);
  const ownerNameOf = (o: Pick<Objective, 'ownerUserId' | 'ownerTeamId'>) =>
    names.get(o.ownerUserId ? `user:${o.ownerUserId}` : `team:${o.ownerTeamId}`) ??
    'Responsable sin nombre';
  const related = (o: Objective) => ({
    id: o.id,
    title: o.title,
    status: o.status,
    ownerName: ownerNameOf(o),
  });

  const parentObjective = objective.parentObjectiveId
    ? published.find((o) => o.id === objective.parentObjectiveId)
    : undefined;
  const children = published.filter((o) => o.parentObjectiveId === objective.id);
  const parentOptions = published
    .filter((o) => o.id !== objective.id)
    .map((o) => ({ id: o.id, label: `${o.title} · ${ownerNameOf(o)}` }));
  const cycleName = cycles.find((c) => c.id === objective.cycleId)?.name ?? 'Ciclo';

  const canEdit = canEditObjective(user, objective);
  const open = objective.status !== 'CLOSED';
  // Historial de cada KR en paralelo (ya conocemos sus ids); un borrador no tiene check-ins.
  const histories =
    objective.status === 'DRAFT'
      ? []
      : await Promise.all(objective.keyResults.map((kr) => listKrCheckIns(kr.id)));
  const history = new Map(objective.keyResults.map((kr, i) => [kr.id, histories[i] ?? []]));
  const checkInReasons = Object.fromEntries(
    objective.keyResults.map((kr) => {
      const availability = checkInAvailability(user, objective, kr);
      return [kr.id, availability.allowed ? null : availability.reason];
    }),
  );
  const people = users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name }));

  return (
    <>
      <PageHeader
        title={objective.title}
        breadcrumbs={[{ label: 'Objetivos', href: '/objetivos' }, { label: objective.title }]}
        actions={
          canEdit && open ? (
            <ObjectiveActions
              objective={objective}
              parents={parentOptions}
              keyResultCount={objective.keyResults.length}
            />
          ) : undefined
        }
      />
      {!canEdit ? (
        <p className="mb-s20 text-body-sm text-ink-muted">
          Solo lo puede modificar su responsable, el líder del equipo o administración.
        </p>
      ) : null}
      <div className="flex flex-col gap-s20">
        <ObjectiveDetailView
          objective={objective}
          ownerName={ownerNameOf(objective)}
          cycleName={cycleName}
          parent={parentObjective ? related(parentObjective) : null}
          aligned={children.map(related)}
        />
        <KeyResultsCard
          objective={{ id: objective.id, status: objective.status }}
          keyResults={objective.keyResults}
          people={people}
          viewerId={user.id}
          canEdit={canEdit}
          canChangeTarget={canChangeKrTarget(user, objective)}
          checkInReasons={checkInReasons}
        />
        {objective.status !== 'DRAFT' ? (
          <KrHistoryCard
            keyResults={objective.keyResults}
            history={history}
            names={new Map(users.map((u) => [u.id, u.name]))}
          />
        ) : null}
      </div>
    </>
  );
}

export default function ObjetivoPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ObjectiveContent params={params} />
    </Suspense>
  );
}

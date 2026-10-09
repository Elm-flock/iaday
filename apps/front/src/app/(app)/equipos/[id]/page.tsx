import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { EditTeamButton } from '../_components/team-admin-actions';
import { TeamDetailView } from '../_components/team-detail-view';
import { flattenTeams, selfAndDescendantIds } from '../team-tree';
import { DisabledAction } from '../../_components/disabled-action';
import { PageSkeleton } from '../../_components/page-skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { listCycles, type Cycle } from '@/lib/dal/cycles';
import { getCurrentUser } from '@/lib/dal/session';
import { getTeamDetail, getTeamTree } from '@/lib/dal/teams';
import { listUsers } from '@/lib/dal/users';
import { cycleLabel } from '@/lib/cycle-label';

export const metadata: Metadata = { title: 'Equipo' };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ cycleId?: string | string[] }>;

/** Ciclo por defecto: un trimestre activo, o si no un anual activo. */
function defaultCycleId(cycles: Cycle[]): string | undefined {
  const active = cycles.filter((c) => c.status === 'ACTIVE');
  return (active.find((c) => c.kind === 'QUARTER') ?? active[0])?.id;
}

async function TeamContent({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const requested = Array.isArray(query.cycleId) ? query.cycleId[0] : query.cycleId;

  // Todo lo independiente arranca junto. Solo sin `?cycleId=` el ciclo por defecto sale de la lista.
  const cyclesPromise = listCycles();
  const sharedPromise = Promise.all([getCurrentUser(), getTeamTree(), listUsers(), cyclesPromise]);
  const cycleId = requested ?? defaultCycleId(await cyclesPromise);
  const [team, [user, tree, users, cycles]] = await Promise.all([
    getTeamDetail(id, cycleId),
    sharedPromise,
  ]);
  if (!team) notFound();

  const isAdmin = user.role === 'ADMIN';
  const memberIds = new Set(team.members.map((m) => m.userId));
  const candidates = users
    .filter((u) => u.active && !memberIds.has(u.id))
    .map((u) => ({ id: u.id, name: u.name }));
  const excluded = selfAndDescendantIds(tree, team.id);
  const parents = flattenTeams(tree).filter((t) => !excluded.has(t.id));
  const parent = team.parentId ? flattenTeams(tree).find((t) => t.id === team.parentId) : undefined;
  const cycleOptions = cycles.map((c) => ({
    id: c.id,
    label: cycleLabel(c),
  }));

  return (
    <>
      <PageHeader
        title={team.name}
        breadcrumbs={[
          { label: 'Equipos', href: '/equipos' },
          ...(parent ? [{ label: parent.name, href: `/equipos/${parent.id}` }] : []),
          { label: team.name },
        ]}
        actions={
          isAdmin ? (
            <EditTeamButton
              team={{ id: team.id, name: team.name, parentId: team.parentId }}
              parents={parents}
            />
          ) : (
            <DisabledAction
              id="edit-team"
              label="Editar equipo"
              reason="Solo administración puede editar equipos e integrantes."
            />
          )
        }
      />
      <TeamDetailView
        team={team}
        cycleOptions={cycleOptions}
        selectedCycleId={cycleId}
        canManage={isAdmin}
        candidates={candidates}
      />
    </>
  );
}

export default function EquipoPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TeamContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

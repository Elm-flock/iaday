import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ObjectivesFilters } from './_components/objectives-filters';
import { groupByOwner, ObjectivesListView } from './_components/objectives-list-view';
import { countsByOwner } from './policy';
import { PageSkeleton } from '../_components/page-skeleton';
import { buttonStyles } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { cycleLabel } from '@/lib/cycle-label';
import { listCycles, type Cycle } from '@/lib/dal/cycles';
import { listObjectives, type Objective } from '@/lib/dal/objectives';
import { getCurrentUser } from '@/lib/dal/session';
import { getTeamTree } from '@/lib/dal/teams';
import { listUsers } from '@/lib/dal/users';
import { flattenTeams } from '../equipos/team-tree';
import NextLink from 'next/link';

export const metadata: Metadata = { title: 'Objetivos' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value || undefined;

/** Ciclo por defecto: un trimestre activo, o si no un anual activo. */
function defaultCycleId(cycles: Cycle[]): string | undefined {
  const active = cycles.filter((c) => c.status === 'ACTIVE');
  return (active.find((c) => c.kind === 'QUARTER') ?? active[0])?.id;
}

const STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED'] as const;

async function ObjectivesContent({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const requestedCycle = first(query.cycleId);

  // Lo independiente arranca junto. Sin `?cycleId=` el ciclo por defecto sale de la lista de ciclos.
  const cyclesPromise = listCycles();
  const sharedPromise = Promise.all([getCurrentUser(), getTeamTree(), listUsers()]);
  const cycles = await cyclesPromise;
  const cycleId = requestedCycle ?? defaultCycleId(cycles);
  const [objectives, [user, tree, users]] = await Promise.all([
    cycleId ? listObjectives({ cycleId }) : Promise.resolve([] as Objective[]),
    sharedPromise,
  ]);

  const teamId = first(query.teamId);
  const ownerUserId = first(query.ownerUserId);
  const rawStatus = first(query.status);
  const status = STATUSES.find((s) => s === rawStatus);

  const teams = flattenTeams(tree);
  const teamNames = new Map(teams.map((t) => [`team:${t.id}`, t.name]));
  const userNames = new Map(users.map((u) => [`user:${u.id}`, u.name]));
  const ownerName = (key: string) =>
    teamNames.get(key) ?? userNames.get(key) ?? 'Responsable sin nombre';

  // Cupo por responsable: se cuenta sobre todo el ciclo (los filtros solo afectan lo que se muestra).
  const slots = countsByOwner(objectives);
  const leadsTeam = (id: string | null) =>
    id !== null && user.teams.some((t) => t.teamId === id && t.isLead);
  // Se ven los borradores de: uno mismo, equipos que lidera, y todo si es ADMIN.
  const seesDrafts = (o: Objective) =>
    user.role === 'ADMIN' || o.ownerUserId === user.id || leadsTeam(o.ownerTeamId);

  const visible = objectives.filter(
    (o) =>
      (!teamId || o.ownerTeamId === teamId) &&
      (!ownerUserId || o.ownerUserId === ownerUserId) &&
      (!status || o.status === status),
  );
  const groups = groupByOwner(visible, ownerName, slots, seesDrafts);

  return (
    <>
      <PageHeader
        title="Objetivos"
        description="Objetivos del ciclo, agrupados por responsable. Cada persona define entre 3 y 5."
        actions={
          <NextLink
            href={cycleId ? `/objetivos/nuevo?cycleId=${cycleId}` : '/objetivos/nuevo'}
            className={buttonStyles({})}
          >
            <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
            Crear objetivo
          </NextLink>
        }
      />
      <ObjectivesFilters
        cycles={cycles.map((c) => ({ id: c.id, label: cycleLabel(c) }))}
        teams={teams.map((t) => ({ id: t.id, label: t.name }))}
        users={users.filter((u) => u.active).map((u) => ({ id: u.id, label: u.name }))}
        cycleId={cycleId}
        teamId={teamId}
        ownerUserId={ownerUserId}
        status={status}
      />
      <ObjectivesListView groups={groups} hasFilters={Boolean(teamId || ownerUserId || status)} />
    </>
  );
}

export default function ObjetivosPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ObjectivesContent searchParams={searchParams} />
    </Suspense>
  );
}

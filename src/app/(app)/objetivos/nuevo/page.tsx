import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ObjectiveCreateForm } from '../_components/objective-create-form';
import { ownerChoices } from '../policy';
import { PageSkeleton } from '../../_components/page-skeleton';
import { flattenTeams } from '../../equipos/team-tree';
import { PageHeader } from '@/components/ui/page-header';
import { cycleLabel } from '@/lib/cycle-label';
import { listCycles, type Cycle } from '@/lib/dal/cycles';
import { listObjectives } from '@/lib/dal/objectives';
import { getCurrentUser } from '@/lib/dal/session';
import { getTeamTree } from '@/lib/dal/teams';
import { listUsers } from '@/lib/dal/users';

export const metadata: Metadata = { title: 'Crear objetivo' };

type SearchParams = Promise<{ cycleId?: string | string[] }>;

function defaultCycleId(cycles: Cycle[]): string | undefined {
  const active = cycles.filter((c) => c.status === 'ACTIVE');
  return (active.find((c) => c.kind === 'QUARTER') ?? active[0])?.id;
}

async function NewObjectiveContent({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const requested = Array.isArray(query.cycleId) ? query.cycleId[0] : query.cycleId;

  // Todo independiente: en paralelo (sesión, directorios, ciclos y candidatos a padre).
  const [user, users, tree, cycles, published] = await Promise.all([
    getCurrentUser(),
    listUsers(),
    getTeamTree(),
    listCycles(),
    listObjectives({ status: 'PUBLISHED' }),
  ]);

  const teams = flattenTeams(tree);
  const owners = ownerChoices(user, { users, teams });
  const open = cycles.filter((c) => c.status !== 'CLOSED');
  const cycleNames = new Map(cycles.map((c) => [c.id, c.name]));
  const ownerNames = new Map([
    ...users.map((u) => [`user:${u.id}`, u.name] as const),
    ...teams.map((t) => [`team:${t.id}`, t.name] as const),
  ]);
  const parents = published.map((o) => ({
    id: o.id,
    label: `${o.title} · ${ownerNames.get(o.ownerUserId ? `user:${o.ownerUserId}` : `team:${o.ownerTeamId}`) ?? 'Sin responsable'} · ${cycleNames.get(o.cycleId) ?? ''}`,
  }));

  const selfValue = `user:${user.id}`;
  return (
    <>
      <PageHeader
        title="Crear objetivo"
        description="Se crea como borrador: después sumás los resultados clave y lo publicás."
        breadcrumbs={[{ label: 'Objetivos', href: '/objetivos' }, { label: 'Crear objetivo' }]}
      />
      <ObjectiveCreateForm
        cycles={open.map((c) => ({ id: c.id, label: cycleLabel(c) }))}
        defaultCycleId={
          requested && open.some((c) => c.id === requested) ? requested : defaultCycleId(open)
        }
        owners={owners}
        defaultOwner={
          owners.users.some((o) => o.value === selfValue) && user.role !== 'ADMIN' ? selfValue : ''
        }
        parents={parents}
      />
    </>
  );
}

export default function NuevoObjetivoPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewObjectiveContent searchParams={searchParams} />
    </Suspense>
  );
}

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CreateTeamButton } from './_components/team-admin-actions';
import { TeamTreeView } from './_components/team-tree-view';
import { flattenTeams } from './team-tree';
import { DisabledAction } from '../_components/disabled-action';
import { PageSkeleton } from '../_components/page-skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { getCurrentUser } from '@/lib/dal/session';
import { getTeamTree } from '@/lib/dal/teams';

export const metadata: Metadata = { title: 'Equipos' };

async function TeamsContent() {
  const [user, tree] = await Promise.all([getCurrentUser(), getTeamTree()]);
  const isAdmin = user.role === 'ADMIN';

  const create = isAdmin ? (
    <CreateTeamButton parents={flattenTeams(tree)} />
  ) : (
    <DisabledAction
      id="create-team"
      label="Crear equipo"
      reason="Solo administración puede crear equipos."
    />
  );

  return (
    <>
      <PageHeader
        title="Equipos"
        description="Cómo se organiza Flock IT: equipos, integrantes y quién lidera cada uno."
        actions={create}
      />
      <TeamTreeView tree={tree} />
    </>
  );
}

export default function EquiposPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TeamsContent />
    </Suspense>
  );
}

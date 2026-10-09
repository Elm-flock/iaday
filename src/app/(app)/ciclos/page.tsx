import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CreateCycleButton } from './_components/cycle-admin-actions';
import { CyclesTreeView } from './_components/cycles-tree-view';
import { DisabledAction } from '../_components/disabled-action';
import { PageSkeleton } from '../_components/page-skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { listCycles } from '@/lib/dal/cycles';
import { getCurrentUser } from '@/lib/dal/session';

export const metadata: Metadata = { title: 'Ciclos' };

const NOT_ADMIN = 'Solo administración puede crear ciclos.';

async function CyclesContent() {
  // En paralelo: sesión y ciclos no dependen entre sí.
  const [user, cycles] = await Promise.all([getCurrentUser(), listCycles()]);
  const annuals = cycles.filter((c) => c.kind === 'ANNUAL');
  const isAdmin = user.role === 'ADMIN';

  const create = isAdmin ? (
    <CreateCycleButton annuals={annuals} />
  ) : (
    <DisabledAction id="create-cycle" label="Crear ciclo" reason={NOT_ADMIN} />
  );

  return (
    <>
      <PageHeader
        title="Ciclos"
        description="Ciclos anuales y los trimestres en los que se organizan los objetivos."
        actions={create}
      />
      <CyclesTreeView cycles={cycles} />
    </>
  );
}

export default function CiclosPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CyclesContent />
    </Suspense>
  );
}

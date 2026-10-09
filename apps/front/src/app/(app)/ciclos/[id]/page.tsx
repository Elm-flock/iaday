import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { CreateCycleButton, CycleAdminActions } from '../_components/cycle-admin-actions';
import { CycleDetailView } from '../_components/cycle-detail-view';
import { DisabledAction } from '../../_components/disabled-action';
import { PageSkeleton } from '../../_components/page-skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { getCycle, listCycles } from '@/lib/dal/cycles';
import { getCurrentUser } from '@/lib/dal/session';

export const metadata: Metadata = { title: 'Ciclo' };

type Params = Promise<{ id: string }>;

async function CycleContent({ params }: { params: Params }) {
  const { id } = await params;
  // En paralelo: el listado alimenta trimestres/padre y la sesión define las acciones.
  const [user, cycle, cycles] = await Promise.all([getCurrentUser(), getCycle(id), listCycles()]);
  if (!cycle) notFound();

  const isAdmin = user.role === 'ADMIN';
  const parent = cycle.parentId ? cycles.find((c) => c.id === cycle.parentId) : undefined;
  const quarters = cycles.filter((c) => c.parentId === cycle.id);
  const annuals = cycles.filter((c) => c.kind === 'ANNUAL');

  const actions = isAdmin ? (
    <div className="flex flex-wrap items-center gap-s10">
      {cycle.kind === 'ANNUAL' && cycle.status !== 'CLOSED' ? (
        <CreateCycleButton
          annuals={annuals}
          defaultParentId={cycle.id}
          label="Agregar trimestre"
          variant="secondary"
        />
      ) : null}
      <CycleAdminActions cycle={cycle} />
    </div>
  ) : (
    <DisabledAction
      id="manage-cycle"
      label="Editar"
      reason="Solo administración puede editar, activar o cerrar ciclos."
    />
  );

  return (
    <>
      <PageHeader
        title={cycle.name}
        breadcrumbs={[
          { label: 'Ciclos', href: '/ciclos' },
          ...(parent ? [{ label: parent.name, href: `/ciclos/${parent.id}` }] : []),
          { label: cycle.name },
        ]}
        actions={actions}
      />
      <CycleDetailView cycle={cycle} quarters={quarters} />
    </>
  );
}

export default function CicloPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CycleContent params={params} />
    </Suspense>
  );
}

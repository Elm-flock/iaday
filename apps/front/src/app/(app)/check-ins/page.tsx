import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageSkeleton } from '../_components/page-skeleton';
import { toCheckInTarget } from './_components/check-in-target';
import { groupByObjective, PendingListView } from './_components/pending-list-view';
import { PageHeader } from '@/components/ui/page-header';
import { listPendingCheckIns } from '@/lib/dal/check-ins';
import { getObjective } from '@/lib/dal/objectives';

export const metadata: Metadata = { title: 'Pendientes' };

async function PendingContent() {
  const pending = await listPendingCheckIns();

  // Datos completos de cada objetivo afectado (cacheados por id), todos en paralelo.
  const objectiveIds = [...new Set(pending.map((p) => p.objectiveId))];
  const objectives = new Map(
    (await Promise.all(objectiveIds.map((id) => getObjective(id)))).flatMap((o) =>
      o ? [[o.id, o] as const] : [],
    ),
  );

  const items = pending.flatMap((p) => {
    const kr = objectives.get(p.objectiveId)?.keyResults.find((k) => k.id === p.keyResultId);
    if (!kr) return [];
    return [
      {
        objectiveId: p.objectiveId,
        objectiveTitle: p.objectiveTitle,
        target: toCheckInTarget(kr),
        cadence: p.cadence,
        lastCheckInAt: p.lastCheckInAt,
        referenceAt: p.referenceAt,
      },
    ];
  });

  return <PendingListView groups={groupByObjective(items)} />;
}

export default function PendientesPage() {
  return (
    <>
      <PageHeader
        title="Pendientes"
        description="Resultados clave a tu cargo (o de tu equipo, si lo liderás) que pasaron su cadencia sin un check-in."
      />
      <Suspense fallback={<PageSkeleton />}>
        <PendingContent />
      </Suspense>
    </>
  );
}

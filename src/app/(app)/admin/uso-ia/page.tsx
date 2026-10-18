import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ImpactTiles } from './_components/impact-tiles';
import { RangeFilter } from './_components/range-filter';
import { FailuresTable, UsageTable } from './_components/usage-table';
import { PageSkeleton } from '../../_components/page-skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { getAiImpact, getAiUsage, parseRangeDays } from '@/lib/dal/ai';
import { getCurrentUser } from '@/lib/dal/session';

export const metadata: Metadata = { title: 'Uso de IA' };

type SearchParams = Promise<{ dias?: string | string[] }>;

async function UsageContent({ searchParams }: { searchParams: SearchParams }) {
  const [{ dias }, user] = await Promise.all([searchParams, getCurrentUser()]);
  // Solo administración: el resto recibe 404 (no se revela que la sección existe). El back vuelve a
  // exigir ADMIN en cada pedido.
  if (user.role !== 'ADMIN') notFound();

  const days = parseRangeDays(dias);
  const [usage, impact] = await Promise.all([getAiUsage(days), getAiImpact(days)]);

  return (
    <>
      <PageHeader
        title="Uso de IA"
        description="Uso, costo estimado e impacto de la ayuda de IA. Son datos agregados: no muestran personas."
        actions={<RangeFilter current={days} />}
      />
      <div className="flex flex-col gap-s20">
        <ImpactTiles impact={impact} />
        <UsageTable
          title="Uso por función"
          keyHeader="Función"
          rows={usage.byFeature}
          humanizeKey
        />
        <UsageTable title="Uso por modelo" keyHeader="Modelo" rows={usage.byModel} />
        <FailuresTable failures={usage.failures} />
      </div>
    </>
  );
}

export default function UsoIaPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <UsageContent searchParams={searchParams} />
    </Suspense>
  );
}

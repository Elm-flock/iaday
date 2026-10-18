import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageSkeleton } from '../../_components/page-skeleton';
import { RequestForm } from '../_components/request-form';
import { LEGAL_NOTE, isLinkableRoute } from '../messages';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'Pedir un documento adaptado' };

type Param = string | string[] | undefined;
type SearchParams = Promise<{ tipo?: Param; id?: Param }>;
const first = (value: Param) => (Array.isArray(value) ? value[0] : value);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function NewRequestContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const tipo = first(params.tipo);
  const id = first(params.id);
  const link = isLinkableRoute(tipo) && id && UUID.test(id) ? { type: tipo, id } : undefined;
  return <RequestForm link={link} />;
}

export default function NuevoPedidoPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader
        title="Pedir un documento adaptado"
        description="Si necesitás un documento en otro formato, pedíselo a una persona de administración."
        breadcrumbs={[
          { label: 'Documentos adaptados', href: '/pedidos-adaptacion' },
          { label: 'Pedir un documento adaptado' },
        ]}
      />
      <div className="mb-s20 max-w-2xl">
        <Alert tone="info">{LEGAL_NOTE}</Alert>
      </div>
      <Suspense fallback={<PageSkeleton />}>
        <NewRequestContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

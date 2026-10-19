import type { Metadata } from 'next';
import NextLink from 'next/link';
import { Suspense } from 'react';
import { PageSkeleton } from '../_components/page-skeleton';
import { MyRequestCard } from './_components/my-request-card';
import { LEGAL_NOTE } from './messages';
import { Alert } from '@/components/ui/alert';
import { buttonStyles } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { listMyAdaptationRequests } from '@/lib/dal/adaptation-requests';

export const metadata: Metadata = { title: 'Documentos adaptados' };

type SearchParams = Promise<{ creado?: string }>;

const newRequestLink = (
  <NextLink href="/pedidos-adaptacion/nuevo" className={buttonStyles()}>
    Pedir un documento adaptado
  </NextLink>
);

async function MyRequests({ searchParams }: { searchParams: SearchParams }) {
  const [params, page] = await Promise.all([searchParams, listMyAdaptationRequests()]);
  return (
    <div className="flex flex-col gap-s20">
      {params.creado ? (
        <Alert tone="success">
          Recibimos tu pedido. Acá abajo podés ver en qué estado está y hasta cuándo lo vamos a
          responder.
        </Alert>
      ) : null}
      <h2 className="text-heading-2 font-light tracking-heading text-ink">Mis pedidos</h2>
      {page.items.length === 0 ? (
        <EmptyState
          title="Todavía no pediste ningún documento"
          description="Cuando pidas uno, lo vas a ver acá con su estado."
          action={newRequestLink}
        />
      ) : (
        <>
          <ul className="flex flex-col gap-s15">
            {page.items.map((r) => (
              <li key={r.id}>
                <MyRequestCard request={r} />
              </li>
            ))}
          </ul>
          {page.total > page.items.length ? (
            <p className="text-body-sm text-ink-muted">
              Mostramos tus {page.items.length} pedidos más nuevos de {page.total}.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function PedidosAdaptacionPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader
        title="Documentos adaptados"
        description="Pedí un documento en lectura fácil, lenguaje claro, audio u otro formato a una persona del equipo de administración."
        actions={newRequestLink}
      />
      <div className="mb-s20 max-w-3xl">
        <Alert tone="info">{LEGAL_NOTE}</Alert>
      </div>
      <Suspense fallback={<PageSkeleton />}>
        <MyRequests searchParams={searchParams} />
      </Suspense>
    </>
  );
}

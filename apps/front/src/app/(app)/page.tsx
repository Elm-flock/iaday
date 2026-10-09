import type { Metadata } from 'next';
import { DashboardSections } from './_components/dashboard/sections';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'Inicio' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Inicio: "¿cómo vengo?" de un vistazo. La cabecera es estática; cada card resuelve sus datos
 * dentro de su propio <Suspense> (ver `_components/dashboard/sections.tsx`).
 */
export default function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader
        title="Inicio"
        description="Cómo venís con tus objetivos y qué tenés pendiente."
      />
      <DashboardSections searchParams={searchParams} />
    </>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { PageSkeleton } from '../../_components/page-skeleton';
import { ManualView } from '../_components/help-views';
import { MANUAL_LABEL, findManual, isManualId, manualsForRole } from '../help-data';
import { getCurrentUser } from '@/lib/dal/session';

type Params = Promise<{ manual: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { manual } = await params;
  return { title: isManualId(manual) ? MANUAL_LABEL[manual] : 'Ayuda' };
}

async function ManualPage({ params }: { params: Params }) {
  const [{ manual: id }, user] = await Promise.all([params, getCurrentUser()]);
  const available = manualsForRole(user.role);
  const manual = findManual(id);
  // Un manual inexistente o que el rol no puede leer (el de administración) responde 404: ni siquiera se
  // revela que existe. El contenido sale del servidor solo después de este chequeo.
  if (!manual || !available.some((m) => m.id === manual.id)) notFound();
  return <ManualView manual={manual} available={available} />;
}

export default function AyudaManualPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ManualPage params={params} />
    </Suspense>
  );
}

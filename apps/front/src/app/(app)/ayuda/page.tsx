import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageSkeleton } from '../_components/page-skeleton';
import { HelpHomeView } from './_components/help-views';
import { manualsForRole } from './help-data';
import { searchSections } from './search';
import { getCurrentUser } from '@/lib/dal/session';

export const metadata: Metadata = { title: 'Ayuda' };

type SearchParams = Promise<{ q?: string | string[] }>;

async function HelpHome({ searchParams }: { searchParams: SearchParams }) {
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  // La búsqueda solo mira los manuales que el rol puede leer.
  const manuals = manualsForRole(user.role);
  const raw = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = (raw ?? '').trim().slice(0, 80);
  const hits = query
    ? searchSections(
        manuals.flatMap((m) => m.sections),
        query,
      )
    : null;
  return <HelpHomeView manuals={manuals} query={query} hits={hits} />;
}

export default function AyudaPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HelpHome searchParams={searchParams} />
    </Suspense>
  );
}

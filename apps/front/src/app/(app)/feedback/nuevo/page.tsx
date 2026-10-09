import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageSkeleton } from '../../_components/page-skeleton';
import { FeedbackForm } from '../_components/feedback-form';
import { PageHeader } from '@/components/ui/page-header';
import { listObjectives } from '@/lib/dal/objectives';
import { getCurrentUser } from '@/lib/dal/session';
import { listUsers } from '@/lib/dal/users';
import { buildLinkOptions } from '@/lib/okr-link';

export const metadata: Metadata = { title: 'Dar feedback' };

type SearchParams = Promise<{ para?: string }>;

async function NewFeedbackContent({ searchParams }: { searchParams: SearchParams }) {
  const { para } = await searchParams;
  const [viewer, users, objectives] = await Promise.all([
    getCurrentUser(),
    listUsers(),
    listObjectives(),
  ]);
  const people = users
    .filter((u) => u.active && u.id !== viewer.id)
    .map((u) => ({
      id: u.id,
      name: u.name,
    }));
  const defaultToUserId = people.some((p) => p.id === para) ? para : undefined;

  return (
    <FeedbackForm
      people={people}
      links={buildLinkOptions(objectives)}
      defaultToUserId={defaultToUserId}
    />
  );
}

export default function DarFeedbackPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader
        title="Dar feedback"
        description="Un mensaje claro y específico ayuda más que uno largo. Pensá en lo que le serviría a la otra persona para seguir creciendo."
        breadcrumbs={[{ label: 'Feedback', href: '/feedback' }, { label: 'Dar feedback' }]}
      />
      <Suspense fallback={<PageSkeleton />}>
        <NewFeedbackContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

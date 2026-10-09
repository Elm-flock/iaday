import type { Metadata } from 'next';
import NextLink from 'next/link';
import { Suspense } from 'react';
import { PageSkeleton } from '../_components/page-skeleton';
import { FeedbackListView } from './_components/feedback-list-view';
import { FeedbackTabs } from './_components/feedback-tabs';
import { PrivacyNotice } from './_components/privacy-notice';
import { isUnread } from './policy';
import { Alert } from '@/components/ui/alert';
import { buttonStyles } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { getCurrentUser } from '@/lib/dal/session';
import { listFeedback, type FeedbackBox } from '@/lib/dal/feedback';
import { listUsers } from '@/lib/dal/users';

export const metadata: Metadata = { title: 'Feedback' };

type SearchParams = Promise<{ box?: string; enviado?: string; eliminado?: string }>;

async function FeedbackContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const box: FeedbackBox = params.box === 'sent' ? 'sent' : 'received';

  // Lecturas sin cache (feedback privado), en paralelo. La bandeja "recibido" siempre se pide para el contador.
  const [viewer, users, received, sent] = await Promise.all([
    getCurrentUser(),
    listUsers(),
    listFeedback('received'),
    box === 'sent' ? listFeedback('sent') : Promise.resolve([]),
  ]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  const unread = received.filter((f) => isUnread(viewer.id, f)).length;

  return (
    <>
      {params.enviado ? (
        <Alert tone="success" className="mb-s20">
          Enviamos tu feedback. Solo vos y la otra persona pueden verlo.
        </Alert>
      ) : null}
      {params.eliminado ? (
        <Alert tone="success" className="mb-s20">
          Eliminamos el feedback. La otra persona ya no lo ve.
        </Alert>
      ) : null}
      <FeedbackTabs current={box} unreadCount={unread} />
      <FeedbackListView
        box={box}
        items={box === 'received' ? received : sent}
        viewerId={viewer.id}
        names={names}
      />
    </>
  );
}

export default function FeedbackPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader
        title="Feedback"
        description="Conversaciones concretas y respetuosas entre personas, en las dos direcciones: dar y recibir feedback es parte del trabajo."
        actions={
          <NextLink href="/feedback/nuevo" className={buttonStyles()}>
            Dar feedback
          </NextLink>
        }
      />
      <div className="mb-s20">
        <PrivacyNotice />
      </div>
      <Suspense fallback={<PageSkeleton />}>
        <FeedbackContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

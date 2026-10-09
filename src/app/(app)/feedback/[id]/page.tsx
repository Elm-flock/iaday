import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { PageSkeleton } from '../../_components/page-skeleton';
import { FeedbackAuthorActions } from '../_components/feedback-author-actions';
import { FeedbackDetailView, type FeedbackLinkInfo } from '../_components/feedback-detail-view';
import { MarkAsRead } from '../_components/mark-as-read';
import { PrivacyNotice } from '../_components/privacy-notice';
import { canModifyFeedback, feedbackRole, isUnread } from '../policy';
import { PageHeader } from '@/components/ui/page-header';
import { getFeedback } from '@/lib/dal/feedback';
import { getObjective } from '@/lib/dal/objectives';
import { getCurrentUser } from '@/lib/dal/session';
import { listUsers } from '@/lib/dal/users';

// Título genérico a propósito: el contenido del feedback nunca va a metadatos.
export const metadata: Metadata = { title: 'Feedback' };

type Params = Promise<{ id: string }>;

async function FeedbackDetail({ params }: { params: Params }) {
  const { id } = await params;
  const [feedback, viewer, users] = await Promise.all([
    getFeedback(id),
    getCurrentUser(),
    listUsers(),
  ]);
  // Ajeno (tercero, líder o ADMIN) = 404 del back, indistinguible de uno inexistente.
  if (!feedback) notFound();
  const role = feedbackRole(viewer.id, feedback);
  if (!role) notFound();

  const names = new Map(users.map((u) => [u.id, u.name]));
  const objective = feedback.objectiveId ? await getObjective(feedback.objectiveId) : null;
  const link: FeedbackLinkInfo | null = feedback.objectiveId
    ? {
        objectiveId: feedback.objectiveId,
        objectiveTitle: objective?.title ?? null,
        keyResultTitle:
          objective?.keyResults.find((k) => k.id === feedback.keyResultId)?.title ?? null,
      }
    : null;
  const other = role === 'author' ? feedback.toUserId : feedback.fromUserId;

  return (
    <>
      <PageHeader
        title={role === 'author' ? 'Feedback enviado' : 'Feedback recibido'}
        description={`Conversación con ${names.get(other) ?? 'una persona sin nombre'}.`}
        breadcrumbs={[
          { label: 'Feedback', href: `/feedback?box=${role === 'author' ? 'sent' : 'received'}` },
          { label: 'Detalle' },
        ]}
        actions={
          canModifyFeedback(viewer.id, feedback) ? (
            <FeedbackAuthorActions id={feedback.id} content={feedback.content} />
          ) : undefined
        }
      />
      <div className="flex max-w-3xl flex-col gap-s20">
        <PrivacyNotice />
        <FeedbackDetailView
          fromName={names.get(feedback.fromUserId) ?? 'Persona sin nombre'}
          toName={names.get(feedback.toUserId) ?? 'Persona sin nombre'}
          content={feedback.content}
          createdAt={feedback.createdAt}
          readAt={feedback.readAt}
          viewerRole={role}
          link={link}
        />
      </div>
      {isUnread(viewer.id, feedback) ? <MarkAsRead id={feedback.id} /> : null}
    </>
  );
}

export default function FeedbackDetailPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FeedbackDetail params={params} />
    </Suspense>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { AssistantUnavailable } from './_components/assistant-unavailable';
import { ChatPanel } from './_components/chat-panel';
import { DigestCard } from './_components/digest-card';
import { PageSkeleton } from '../../_components/page-skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { getDigest, getMessages } from '@/lib/dal/assistant';
import { getCurrentUser } from '@/lib/dal/session';

export const metadata: Metadata = { title: 'Asistente' };

async function DigestSection() {
  const digest = await getDigest();
  if (!digest) {
    return (
      <AssistantUnavailable message="No pudimos cargar las novedades ahora. El resto de la plataforma funciona con normalidad." />
    );
  }
  return <DigestCard initial={digest} />;
}

async function ChatSection() {
  const [digest, messages] = await Promise.all([getDigest(), getMessages()]);
  return (
    <ChatPanel initialMessages={messages ?? []} chatAvailable={digest?.chatAvailable ?? false} />
  );
}

async function AssistantContent() {
  const user = await getCurrentUser();
  // Solo administración: el resto recibe 404 (no se revela que la sección existe). El back vuelve a
  // exigir ADMIN en cada pedido.
  if (user.role !== 'ADMIN') notFound();

  return (
    <>
      <PageHeader
        title="Asistente"
        description="Pedile tareas de administración en tus palabras. Antes de cambiar algo te muestra un plan y espera tu confirmación."
      />
      <div className="flex flex-col gap-s30">
        <Suspense
          fallback={
            <div className="h-40 animate-pulse rounded-lg bg-surface-subtle" aria-hidden="true" />
          }
        >
          <DigestSection />
        </Suspense>
        <Suspense
          fallback={
            <div className="h-64 animate-pulse rounded-lg bg-surface-subtle" aria-hidden="true" />
          }
        >
          <ChatSection />
        </Suspense>
      </div>
    </>
  );
}

export default function AsistentePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AssistantContent />
    </Suspense>
  );
}

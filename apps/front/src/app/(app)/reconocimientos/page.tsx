import type { Metadata } from 'next';
import NextLink from 'next/link';
import { Suspense } from 'react';
import { PageSkeleton } from '../_components/page-skeleton';
import type { CardMilestone } from './_components/recognition-card';
import { RecognitionsWall, type WallItem } from './_components/recognitions-wall';
import { Alert } from '@/components/ui/alert';
import { buttonStyles } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { getObjective, type Objective } from '@/lib/dal/objectives';
import { listRecognitions, type Recognition } from '@/lib/dal/recognitions';
import { listUsers } from '@/lib/dal/users';

export const metadata: Metadata = { title: 'Reconocimientos' };

type SearchParams = Promise<{ persona?: string; page?: string; creado?: string }>;

function milestoneOf(r: Recognition, objectives: Map<string, Objective | null>): CardMilestone {
  if (!r.objectiveId) return null;
  const objective = objectives.get(r.objectiveId);
  if (!objective) return { kind: 'unavailable' };
  if (r.keyResultId) {
    const kr = objective.keyResults.find((k) => k.id === r.keyResultId);
    if (!kr) return { kind: 'unavailable' };
    return { kind: 'kr', title: kr.title, objectiveTitle: objective.title, score: kr.score };
  }
  return {
    kind: 'objective',
    title: objective.title,
    score: objective.finalScore ?? objective.score,
  };
}

async function WallContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  const [wall, users] = await Promise.all([
    listRecognitions(page, params.persona || undefined),
    listUsers(),
  ]);
  const objectiveIds = [
    ...new Set(wall.items.flatMap((r) => (r.objectiveId ? [r.objectiveId] : []))),
  ];
  const objectives = new Map(
    await Promise.all(objectiveIds.map(async (id) => [id, await getObjective(id)] as const)),
  );

  const names = new Map(users.map((u) => [u.id, u.name]));
  const items: WallItem[] = wall.items.map((r) => ({
    id: r.id,
    fromName: names.get(r.fromUserId) ?? 'Persona sin nombre',
    toName: names.get(r.toUserId) ?? 'Persona sin nombre',
    message: r.message,
    createdAt: r.createdAt,
    milestone: milestoneOf(r, objectives),
  }));

  return (
    <>
      {params.creado ? (
        <Alert tone="success" className="mb-s20">
          Enviamos el reconocimiento. Ya está en el muro.
        </Alert>
      ) : null}
      <RecognitionsWall
        items={items}
        people={users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name }))}
        personId={params.persona || undefined}
        page={wall.page}
        pages={Math.max(1, Math.ceil(wall.total / wall.limit))}
      />
    </>
  );
}

export default function ReconocimientosPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader
        title="Reconocimientos"
        description="Un muro abierto para agradecer logros concretos. No hay puntos ni posiciones: lo que cuenta es lo que se hizo."
        actions={
          <NextLink href="/reconocimientos/nuevo" className={buttonStyles()}>
            Reconocer un logro
          </NextLink>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <WallContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

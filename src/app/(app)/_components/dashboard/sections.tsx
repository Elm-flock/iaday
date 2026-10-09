import { connection } from 'next/server';
import { Suspense } from 'react';
import { AdminCard } from './admin-card';
import { CardSkeleton } from './card-skeleton';
import { FeedbackNote } from './feedback-note';
import { LeaderTeamsCard } from './leader-teams-card';
import { MyObjectivesCard } from './my-objectives-card';
import { PendingCard } from './pending-card';
import { dashboardPrimary } from './primary-action';
import { RecognitionsCard } from './recognitions-card';
import { CycleSelect } from '../../equipos/_components/cycle-select';
import { pickDashboardCycle } from '@/lib/active-cycle';
import { cycleLabel } from '@/lib/cycle-label';
import { listCycles } from '@/lib/dal/cycles';
import {
  getLedTeams,
  getMyObjectives,
  getPendingSummary,
  getRecognitionsSummary,
} from '@/lib/dal/dashboard';
import { countUnreadFeedback } from '@/lib/dal/feedback';
import { getCurrentUser } from '@/lib/dal/session';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Hoy en Buenos Aires como YYYY-MM-DD (se llama solo tras leer `searchParams`, ya en runtime). */
function todayAr(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
    new Date(),
  );
}

async function FeedbackSection() {
  return <FeedbackNote unread={await countUnreadFeedback()} />;
}

async function PendingSection() {
  const { total, top } = await getPendingSummary();
  return <PendingCard total={total} top={top} />;
}

async function RecognitionsSection() {
  const user = await getCurrentUser();
  const { received, wall } = await getRecognitionsSummary(user.id);
  return <RecognitionsCard received={received} wall={wall} />;
}

/** Todo lo que depende del ciclo: selector, mis objetivos, mis equipos (líder) y administración. */
async function CycleScope({ searchParams }: { searchParams: SearchParams }) {
  // La fecha de hoy es un valor inestable: va después de un acceso dinámico (regla de prerender de Next 16.4).
  await connection();
  const query = await searchParams;
  const requested = Array.isArray(query.cycleId) ? query.cycleId[0] : query.cycleId;

  const [user, cycles] = await Promise.all([getCurrentUser(), listCycles()]);
  const cycle = pickDashboardCycle(cycles, requested || undefined, todayAr());
  const activeCycle = cycles.find((c) => c.status === 'ACTIVE' && c.kind === 'QUARTER') ?? cycle;

  const leadsTeams = user.teams.some((t) => t.isLead);
  const [mine, pending, ledTeams] = cycle
    ? await Promise.all([
        getMyObjectives(user, cycle.id),
        getPendingSummary(),
        leadsTeams ? getLedTeams(user, cycle.id) : Promise.resolve([]),
      ])
    : [{ individual: [], team: [] }, { total: 0, top: [] }, []];

  const primary = dashboardPrimary({
    pendingTotal: pending.total,
    individualObjectives: mine.individual.length,
  });

  return (
    <div className="flex flex-col gap-s20">
      <CycleSelect
        options={cycles.map((c) => ({ id: c.id, label: cycleLabel(c) }))}
        selectedId={cycle?.id}
        allowNone={false}
      />
      {cycle ? (
        <MyObjectivesCard
          individual={mine.individual}
          team={mine.team}
          cycleId={cycle.id}
          primaryCreate={primary === 'create-objective'}
        />
      ) : (
        <p className="text-body text-ink-muted">
          No hay un ciclo activo todavía. Cuando administración active uno, vas a ver acá tus
          objetivos.
        </p>
      )}
      {cycle && leadsTeams ? <LeaderTeamsCard teams={ledTeams} cycleId={cycle.id} /> : null}
      {user.role === 'ADMIN' ? <AdminCard cycle={activeCycle} /> : null}
    </div>
  );
}

/**
 * Cada grupo va en su propio <Suspense>: ninguna card espera a otra (sin cascadas). Los datos
 * cacheados (privados) se comparten entre cards de una misma request; el feedback no usa cache.
 */
export function DashboardSections({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <Suspense fallback={null}>
        <FeedbackSection />
      </Suspense>
      <div className="grid gap-s20 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Suspense fallback={<CardSkeleton className="h-72" />}>
            <CycleScope searchParams={searchParams} />
          </Suspense>
        </div>
        <div className="flex flex-col gap-s20">
          <Suspense fallback={<CardSkeleton />}>
            <PendingSection />
          </Suspense>
          <Suspense fallback={<CardSkeleton className="h-64" />}>
            <RecognitionsSection />
          </Suspense>
        </div>
      </div>
    </>
  );
}

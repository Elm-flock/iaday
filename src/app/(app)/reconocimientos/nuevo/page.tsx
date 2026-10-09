import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageSkeleton } from '../../_components/page-skeleton';
import { RecognitionForm } from '../_components/recognition-form';
import { MILESTONE_RULE } from '../messages';
import { listMilestones } from '../milestones';
import { Alert } from '@/components/ui/alert';
import { buttonStyles } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { listObjectives } from '@/lib/dal/objectives';
import { getCurrentUser } from '@/lib/dal/session';
import { listUsers } from '@/lib/dal/users';

export const metadata: Metadata = { title: 'Reconocer un logro' };

type SearchParams = Promise<{ para?: string }>;

/** Flujo en dos pasos sin estado en el cliente: 1) elegir persona (GET `?para=`), 2) elegir su logro + mensaje. */
async function NewRecognitionContent({ searchParams }: { searchParams: SearchParams }) {
  const { para } = await searchParams;
  const [viewer, users] = await Promise.all([getCurrentUser(), listUsers()]);
  const people = users.filter((u) => u.active && u.id !== viewer.id);
  const person = people.find((p) => p.id === para);

  return (
    <div className="flex max-w-2xl flex-col gap-s20">
      <form method="get" className="flex flex-wrap items-end gap-s10">
        <FormField label="Persona" required className="w-72 max-w-full">
          <Select name="para" defaultValue={person?.id ?? ''}>
            <option value="" disabled>
              Elegí una persona
            </option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormField>
        <button
          type="submit"
          className={buttonStyles({ variant: person ? 'secondary' : 'primary' })}
        >
          {person ? 'Cambiar persona' : 'Continuar'}
        </button>
      </form>

      {person ? <MilestoneStep personId={person.id} personName={person.name} /> : null}
    </div>
  );
}

async function MilestoneStep({ personId, personName }: { personId: string; personName: string }) {
  // Sin filtro: incluye los objetivos de equipo donde la persona es responsable de un KR.
  const objectives = await listObjectives();
  const milestones = listMilestones(objectives, personId);

  if (milestones.length === 0) {
    return (
      <Alert tone="info" title={`${personName} todavía no tiene logros para reconocer`}>
        {MILESTONE_RULE} Cuando haya uno, vas a poder elegirlo acá.
      </Alert>
    );
  }
  return <RecognitionForm toUserId={personId} toName={personName} milestones={milestones} />;
}

export default function ReconocerPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader
        title="Reconocer un logro"
        description="Elegí a la persona, después el logro concreto que querés destacar y contale por qué importó."
        breadcrumbs={[
          { label: 'Reconocimientos', href: '/reconocimientos' },
          { label: 'Reconocer un logro' },
        ]}
      />
      <Suspense fallback={<PageSkeleton />}>
        <NewRecognitionContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

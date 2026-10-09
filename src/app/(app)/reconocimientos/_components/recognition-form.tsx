'use client';

import { createRecognitionAction } from '../actions';
import { MESSAGE_MAX, MILESTONE_RULE } from '../messages';
import type { MilestoneOption } from '../milestones';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useActionForm } from '@/lib/actions/use-action-form';
import { formatScore } from '@/lib/format';

type Props = {
  toUserId: string;
  toName: string;
  milestones: MilestoneOption[];
};

const optionLabel = (m: MilestoneOption) =>
  m.kind === 'kr'
    ? `Resultado clave: ${m.title} (${m.objectiveTitle}) · ${formatScore(m.score)}`
    : `Objetivo cerrado: ${m.title} · ${formatScore(m.score)}`;

/** Paso 2: elegir el logro de la persona y escribir el mensaje. */
export function RecognitionForm({ toUserId, toName, milestones }: Props) {
  const { state, onSubmit, pending } = useActionForm(createRecognitionAction);
  const values = state.values ?? {};
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-s20" noValidate>
      <input type="hidden" name="toUserId" value={toUserId} />
      {state.status === 'error' && state.message ? (
        <Alert tone="danger">{state.message}</Alert>
      ) : null}

      <FormField label="Logro" required error={errors.milestone} help={MILESTONE_RULE}>
        <Select name="milestone" defaultValue={values.milestone ?? ''}>
          <option value="" disabled>
            Elegí un logro de {toName}
          </option>
          {milestones.map((m) => (
            <option key={m.value} value={m.value}>
              {optionLabel(m)}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        label="Mensaje"
        required
        error={errors.message}
        help="Contá qué hizo y por qué importó. Lo específico se agradece más."
      >
        <Textarea
          name="message"
          rows={5}
          maxLength={MESSAGE_MAX}
          defaultValue={values.message ?? ''}
          placeholder="Ordenaste el proceso de onboarding y redujiste el tiempo de alta a la mitad."
        />
      </FormField>

      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          Reconocer logro
        </Button>
      </div>
    </form>
  );
}

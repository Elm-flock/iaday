'use client';

import { useRef, useState } from 'react';
import { createObjectiveAction } from '../actions';
import { ObjectiveFields, type ParentOption } from './objective-fields';
import type { OwnerChoices } from '../policy';
import { SuggestOkrButton } from '../../_ai/_components/suggest-okr-button';
import { buildObjectiveSuggestInput, formValues, objectivePrefill } from '../../_ai/suggest-input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { useActionForm } from '@/lib/actions/use-action-form';

export type CycleOption = { id: string; label: string };

/** Formulario de alta de objetivo (hoja cliente). Al crear, la action redirige al detalle para cargar los resultados clave. */
export function ObjectiveCreateForm({
  cycles,
  defaultCycleId,
  owners,
  defaultOwner,
  parents,
  aiEnabled = false,
}: {
  cycles: CycleOption[];
  defaultCycleId: string | undefined;
  owners: OwnerChoices;
  /** Valor `user:{id}` de quien consulta si puede ser responsable (el resto elige a mano). */
  defaultOwner: string;
  parents: ParentOption[];
  /** La ayuda de IA está activa: se ofrece "Sugerir redacción" (nunca se aplica sola). */
  aiEnabled?: boolean;
}) {
  const { state, onSubmit, pending } = useActionForm(createObjectiveAction);
  const formRef = useRef<HTMLFormElement>(null);
  // Al usar una sugerencia se precargan título/descripción: los campos se remontan con `key` para tomar el
  // nuevo `defaultValue` sin perder lo demás que la persona ya tipeó.
  const [prefill, setPrefill] = useState<Record<string, string>>({});
  const [fieldsKey, setFieldsKey] = useState(0);
  const values = { ...(state.values ?? {}), ...prefill };
  const errors = state.fieldErrors ?? {};
  const noOwners = owners.users.length + owners.teams.length === 0;

  return (
    <Card>
      <form
        ref={formRef}
        onSubmit={onSubmit}
        className="flex max-w-2xl flex-col gap-s15"
        noValidate
      >
        {state.status === 'error' && state.message ? (
          <Alert tone="danger">{state.message}</Alert>
        ) : null}

        <FormField label="Ciclo" required error={errors.cycleId}>
          <Select name="cycleId" defaultValue={values.cycleId ?? defaultCycleId ?? ''}>
            <option value="" disabled>
              Elegí un ciclo
            </option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Responsable" required error={errors.owner} help={owners.explanation}>
          <Select name="owner" defaultValue={values.owner ?? defaultOwner}>
            <option value="" disabled>
              Elegí quién es responsable
            </option>
            {owners.users.length > 0 ? (
              <optgroup label="Personas">
                {owners.users.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {owners.teams.length > 0 ? (
              <optgroup label="Equipos">
                {owners.teams.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </Select>
        </FormField>

        <ObjectiveFields
          key={fieldsKey}
          values={values}
          errors={errors}
          defaults={{}}
          parents={parents}
        />

        {aiEnabled ? (
          <SuggestOkrButton
            scope="objective"
            buildInput={() =>
              buildObjectiveSuggestInput(new FormData(formRef.current ?? undefined))
            }
            onUse={(suggestion) => {
              setPrefill({
                ...formValues(formRef.current),
                ...objectivePrefill(suggestion.objective),
              });
              setFieldsKey((k) => k + 1);
            }}
          />
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" loading={pending} disabled={noOwners || cycles.length === 0}>
            Crear objetivo
          </Button>
        </div>
      </form>
    </Card>
  );
}

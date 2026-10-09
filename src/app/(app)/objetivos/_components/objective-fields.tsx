'use client';

import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TextInput } from '@/components/ui/text-input';
import {
  OBJECTIVE_KIND_LOCKED_REASON,
  OBJECTIVE_ORIGIN_LABEL,
  OBJECTIVE_TYPE_LABEL,
} from '../messages';

export type ParentOption = { id: string; label: string };

type Values = Record<string, string>;
type Errors = Record<string, string>;

/**
 * Campos compartidos del objetivo (alta y edición). Selects NO controlados (`defaultValue`):
 * el formulario se despacha desde `onSubmit` y conserva lo ingresado ante un error.
 */
export function ObjectiveFields({
  values,
  errors,
  defaults,
  parents,
  kindLocked = false,
}: {
  values: Values;
  errors: Errors;
  defaults: {
    title?: string;
    description?: string;
    type?: string;
    origin?: string;
    parent?: string;
  };
  parents: ParentOption[];
  /** Objetivo publicado: tipo y origen no se pueden cambiar (se muestra deshabilitado con la razón). */
  kindLocked?: boolean;
}) {
  return (
    <>
      <FormField label="Título" required error={errors.title}>
        <TextInput
          name="title"
          defaultValue={values.title ?? defaults.title ?? ''}
          maxLength={200}
          placeholder="Reducir el tiempo de entrega"
        />
      </FormField>

      <FormField label="Descripción" error={errors.description}>
        <Textarea
          name="description"
          defaultValue={values.description ?? defaults.description ?? ''}
          maxLength={2000}
        />
      </FormField>

      <div className="grid grid-cols-1 gap-s15 sm:grid-cols-2">
        <FormField
          label="Tipo"
          required
          error={errors.type}
          help={
            kindLocked
              ? OBJECTIVE_KIND_LOCKED_REASON
              : 'Comprometido: se espera 1,00. Aspiracional: se considera logrado con 0,60–0,70.'
          }
        >
          <Select
            name="type"
            defaultValue={values.type ?? defaults.type ?? ''}
            disabled={kindLocked}
          >
            <option value="" disabled>
              Elegí el tipo
            </option>
            {Object.entries(OBJECTIVE_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          label="Origen"
          required
          error={errors.origin}
          help={
            kindLocked
              ? OBJECTIVE_KIND_LOCKED_REASON
              : 'Top-down: baja desde la dirección. Bottom-up: nace en las personas.'
          }
        >
          <Select
            name="origin"
            defaultValue={values.origin ?? defaults.origin ?? ''}
            disabled={kindLocked}
          >
            <option value="" disabled>
              Elegí el origen
            </option>
            {Object.entries(OBJECTIVE_ORIGIN_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <FormField
        label="Alineado a (opcional)"
        error={errors.parentObjectiveId}
        help="Solo se pueden elegir objetivos ya publicados, incluso de otros ciclos."
      >
        <Select
          name="parentObjectiveId"
          defaultValue={values.parentObjectiveId ?? defaults.parent ?? ''}
        >
          <option value="">Sin alineación</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </FormField>
    </>
  );
}

'use client';

import { createAdaptationRequestAction } from '../actions';
import {
  DESCRIPTION_MAX,
  ENTITY_BY_ROUTE,
  ENTITY_LABEL,
  FORMATS,
  FORMAT_LABEL,
  SUBJECT_MAX,
  type LinkableRoute,
} from '../messages';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TextInput } from '@/components/ui/text-input';
import { useActionForm } from '@/lib/actions/use-action-form';

type Props = {
  /** Elemento desde el que se llegó (objetivo, check-in o feedback). El back confirma el permiso. */
  link?: { type: LinkableRoute; id: string };
};

/** Formulario "Pedir un documento adaptado a una persona" (RD 707/2026, art. 14.5). */
export function RequestForm({ link }: Props) {
  const { state, onSubmit, pending } = useActionForm(createAdaptationRequestAction);
  const values = state.values ?? {};
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-s20" noValidate>
      {state.status === 'error' && state.message ? (
        <Alert tone="danger">{state.message}</Alert>
      ) : null}

      <FormField
        label="¿Qué documento necesitás?"
        required
        error={errors.subject}
        help="Por ejemplo: el reporte del ciclo, un objetivo o el manual."
      >
        <TextInput name="subject" maxLength={SUBJECT_MAX} defaultValue={values.subject ?? ''} />
      </FormField>

      <FormField label="¿En qué formato te sirve?" required error={errors.preferredFormat}>
        <Select name="preferredFormat" defaultValue={values.preferredFormat ?? ''}>
          <option value="" disabled>
            Elegí un formato
          </option>
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABEL[f]}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        label="Detalle"
        error={errors.description}
        help="Opcional. Contanos lo que quieras que sepamos para ayudarte mejor."
      >
        <Textarea
          name="description"
          rows={5}
          maxLength={DESCRIPTION_MAX}
          defaultValue={values.description ?? ''}
        />
      </FormField>

      {link ? (
        <>
          <input type="hidden" name="linkType" value={link.type} />
          <input type="hidden" name="linkId" value={link.id} />
          <Alert tone="info">
            Este pedido va vinculado a {ENTITY_LABEL[ENTITY_BY_ROUTE[link.type]]}.
            {link.type === 'feedback'
              ? ' Administración no puede leer tu feedback: contanos en el detalle lo que necesites.'
              : ''}
          </Alert>
          {errors.link ? <Alert tone="danger">{errors.link}</Alert> : null}
        </>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          Enviar pedido
        </Button>
      </div>
    </form>
  );
}

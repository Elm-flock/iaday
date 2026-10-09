'use client';

import { createFeedbackAction } from '../actions';
import { CONTENT_MAX, FEEDBACK_GUIDE } from '../messages';
import { PrivacyNotice } from './privacy-notice';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useActionForm } from '@/lib/actions/use-action-form';

export type PersonOption = { id: string; name: string };
export type LinkOption = { value: string; label: string };

type Props = {
  /** Personas activas, sin quien escribe: no se puede dar feedback a uno mismo. */
  people: PersonOption[];
  links: LinkOption[];
  defaultToUserId?: string;
};

/** Formulario "Dar feedback" (select no controlado: conserva lo elegido ante un error). */
export function FeedbackForm({ people, links, defaultToUserId }: Props) {
  const { state, onSubmit, pending } = useActionForm(createFeedbackAction);
  const values = state.values ?? {};
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-s20" noValidate>
      <PrivacyNotice />
      {state.status === 'error' && state.message ? (
        <Alert tone="danger">{state.message}</Alert>
      ) : null}

      <FormField label="Para quién" required error={errors.toUserId}>
        <Select name="toUserId" defaultValue={values.toUserId ?? defaultToUserId ?? ''}>
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

      <FormField label="Mensaje" required error={errors.content} help={FEEDBACK_GUIDE}>
        <Textarea
          name="content"
          rows={7}
          maxLength={CONTENT_MAX}
          defaultValue={values.content ?? ''}
          placeholder="En la reunión de ayer ordenaste la discusión y eso nos ahorró tiempo. La próxima vez podrías compartir la agenda antes."
        />
      </FormField>

      <FormField
        label="Objetivo o resultado clave relacionado"
        help="Opcional. Solo podés enlazar objetivos que vos puedas ver."
        error={errors.link}
      >
        <Select name="link" defaultValue={values.link ?? ''}>
          <option value="">Sin enlace</option>
          {links.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </Select>
      </FormField>

      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          Enviar feedback
        </Button>
      </div>
    </form>
  );
}

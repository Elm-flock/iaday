'use server';

import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedApi } from '@/lib/api/client';
import { callApi } from '@/lib/api/call-api';
import { failureMessage } from '@/lib/api/error-copy';
import { errorState, successState, textValues, type FormState } from '@/lib/actions/form-state';
import { parseCreateFeedback, parseUpdateFeedback } from './feedback-form-data';
import { FEEDBACK_ERROR_COPY } from './messages';

/*
 * El feedback es privado: no hay cache que invalidar (ver `lib/dal/feedback.ts`), así que acá se usa
 * `refresh()` (refresca el router del cliente) y NO `updateTag`. Nunca se loguea el contenido.
 */

const FIX_FIELDS = 'Revisá los campos marcados y probá de nuevo.';

export async function createFeedbackAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = textValues(formData);
  const parsed = parseCreateFeedback(formData);
  if (!parsed.ok) return errorState(FIX_FIELDS, { fieldErrors: parsed.fieldErrors, values });

  const client = await authedApi();
  const result = await callApi(() => client.POST('/feedback', { body: parsed.body }));
  if (!result.ok) {
    return errorState(failureMessage(result.failure, FEEDBACK_ERROR_COPY), { values });
  }
  redirect('/feedback?box=sent&enviado=1');
}

export async function updateFeedbackAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = textValues(formData);
  const parsed = parseUpdateFeedback(formData);
  if (!parsed.ok) return errorState(FIX_FIELDS, { fieldErrors: parsed.fieldErrors, values });

  const client = await authedApi();
  const result = await callApi(() =>
    client.PATCH('/feedback/{id}', { params: { path: { id } }, body: parsed.body }),
  );
  if (!result.ok) {
    return errorState(failureMessage(result.failure, FEEDBACK_ERROR_COPY), { values });
  }
  refresh();
  return successState('Guardamos los cambios del feedback.');
}

export async function deleteFeedbackAction(id: string): Promise<FormState> {
  const client = await authedApi();
  const result = await callApi(() => client.DELETE('/feedback/{id}', { params: { path: { id } } }));
  if (!result.ok) return errorState(failureMessage(result.failure, FEEDBACK_ERROR_COPY));
  redirect('/feedback?box=sent&eliminado=1');
}

/** Lo dispara el receptor al abrir el detalle (efecto del cliente, nunca durante el render). Idempotente en el back; el refresco lo hace el cliente (router.refresh). */
export async function markFeedbackReadAction(id: string): Promise<FormState> {
  const client = await authedApi();
  const result = await callApi(() =>
    client.PATCH('/feedback/{id}/read', { params: { path: { id } } }),
  );
  if (!result.ok) return errorState(failureMessage(result.failure, FEEDBACK_ERROR_COPY));
  return successState('Marcamos el feedback como leído.');
}

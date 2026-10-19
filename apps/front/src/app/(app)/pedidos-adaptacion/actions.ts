'use server';

import { redirect } from 'next/navigation';
import { authedApi } from '@/lib/api/client';
import { callApi } from '@/lib/api/call-api';
import { failureMessage } from '@/lib/api/error-copy';
import { errorState, textValues, type FormState } from '@/lib/actions/form-state';
import { REQUEST_ERROR_COPY } from './messages';
import { parseCreateRequest } from './request-form-data';

/*
 * Un pedido es texto libre de la persona: no hay cache que invalidar (ver `lib/dal/adaptation-requests.ts`)
 * y nunca se loguea el contenido. La autorización real (dueño del pedido, permiso sobre el feedback
 * vinculado) es del back.
 */

export async function createAdaptationRequestAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = textValues(formData);
  const parsed = parseCreateRequest(formData);
  if (!parsed.ok) {
    return errorState('Revisá los campos marcados y probá de nuevo.', {
      fieldErrors: parsed.fieldErrors,
      values,
    });
  }

  const client = await authedApi();
  const result = await callApi(() => client.POST('/adaptation-requests', { body: parsed.body }));
  if (!result.ok) {
    return errorState(failureMessage(result.failure, REQUEST_ERROR_COPY), { values });
  }
  redirect('/pedidos-adaptacion?creado=1');
}

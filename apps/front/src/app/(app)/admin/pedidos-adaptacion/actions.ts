'use server';

import { refresh } from 'next/cache';
import { authedApi } from '@/lib/api/client';
import { callApi } from '@/lib/api/call-api';
import { failureMessage } from '@/lib/api/error-copy';
import { errorState, successState, textValues, type FormState } from '@/lib/actions/form-state';
import { ADMIN_ERROR_COPY } from '../../pedidos-adaptacion/messages';
import { parseAssign, parseDeliver, parseReject } from '../../pedidos-adaptacion/request-form-data';

/*
 * La autorización real (solo ADMIN) es de Nest. Sin cache que invalidar: se usa `refresh()`.
 * Nunca se loguea la justificación ni la nota (texto libre).
 */

const FIX_FIELDS = 'Revisá los campos marcados y probá de nuevo.';

export async function assignRequestAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = textValues(formData);
  const parsed = parseAssign(formData);
  if (!parsed.ok) return errorState(FIX_FIELDS, { fieldErrors: parsed.fieldErrors, values });

  const client = await authedApi();
  const result = await callApi(() =>
    client.PATCH('/adaptation-requests/{id}/assign', {
      params: { path: { id } },
      body: parsed.body,
    }),
  );
  if (!result.ok) return errorState(failureMessage(result.failure, ADMIN_ERROR_COPY), { values });
  refresh();
  return successState('Asignamos el pedido. Ahora figura como en curso.');
}

export async function deliverRequestAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = textValues(formData);
  const parsed = parseDeliver(formData);
  if (!parsed.ok) return errorState(FIX_FIELDS, { fieldErrors: parsed.fieldErrors, values });

  const client = await authedApi();
  const result = await callApi(() =>
    client.POST('/adaptation-requests/{id}/deliver', {
      params: { path: { id } },
      body: parsed.body,
    }),
  );
  if (!result.ok) return errorState(failureMessage(result.failure, ADMIN_ERROR_COPY), { values });
  refresh();
  return successState('Marcamos el pedido como entregado. La persona ya puede ver tu nota.');
}

export async function rejectRequestAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = textValues(formData);
  const parsed = parseReject(formData);
  if (!parsed.ok) return errorState(FIX_FIELDS, { fieldErrors: parsed.fieldErrors, values });

  const client = await authedApi();
  const result = await callApi(() =>
    client.POST('/adaptation-requests/{id}/reject', {
      params: { path: { id } },
      body: parsed.body,
    }),
  );
  if (!result.ok) return errorState(failureMessage(result.failure, ADMIN_ERROR_COPY), { values });
  refresh();
  return successState('Rechazamos el pedido. La persona ya puede ver tu justificación.');
}

'use server';

import { updateTag } from 'next/cache';
import { authedApi } from '@/lib/api/client';
import { callApi } from '@/lib/api/call-api';
import { failureMessage } from '@/lib/api/error-copy';
import { errorState, successState, textValues, type FormState } from '@/lib/actions/form-state';
import { parseCreateCycle, parseUpdateCycle } from './cycle-form-data';
import { CYCLE_ERROR_COPY } from './messages';

/** La autorización real (solo ADMIN) es de Nest: un 403 se traduce a copy. Acá solo se invalida la cache. */
function invalidate(id?: string) {
  updateTag('cycles');
  if (id) updateTag(`cycle:${id}`);
}

export async function createCycleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = textValues(formData);
  const parsed = parseCreateCycle(formData);
  if (!parsed.ok) {
    return errorState('Revisá los campos marcados y probá de nuevo.', {
      fieldErrors: parsed.fieldErrors,
      values,
    });
  }

  const client = await authedApi();
  const result = await callApi(() => client.POST('/cycles', { body: parsed.body }));
  if (!result.ok) return errorState(failureMessage(result.failure, CYCLE_ERROR_COPY), { values });

  invalidate();
  return successState(`Creamos el ciclo "${parsed.body.name}".`);
}

export async function updateCycleAction(
  id: string,
  datesEditable: boolean,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = textValues(formData);
  const parsed = parseUpdateCycle(formData, { datesEditable });
  if (!parsed.ok) {
    return errorState('Revisá los campos marcados y probá de nuevo.', {
      fieldErrors: parsed.fieldErrors,
      values,
    });
  }

  const client = await authedApi();
  const result = await callApi(() =>
    client.PATCH('/cycles/{id}', { params: { path: { id } }, body: parsed.body }),
  );
  if (!result.ok) return errorState(failureMessage(result.failure, CYCLE_ERROR_COPY), { values });

  invalidate(id);
  return successState('Guardamos los cambios del ciclo.');
}

export async function activateCycleAction(id: string): Promise<FormState> {
  const client = await authedApi();
  const result = await callApi(() =>
    client.POST('/cycles/{id}/activate', { params: { path: { id } } }),
  );
  if (!result.ok) return errorState(failureMessage(result.failure, CYCLE_ERROR_COPY));

  invalidate(id);
  return successState('Activamos el ciclo.');
}

export async function closeCycleAction(id: string): Promise<FormState> {
  const client = await authedApi();
  const result = await callApi(() =>
    client.POST('/cycles/{id}/close', { params: { path: { id } } }),
  );
  if (!result.ok) return errorState(failureMessage(result.failure, CYCLE_ERROR_COPY));

  // El cierre cambia los objetivos del ciclo: también se invalidan los datos de OKRs.
  invalidate(id);
  updateTag('okrs');
  const closed = result.data?.closedObjectives ?? 0;
  const achieved = result.data?.achievedObjectives ?? 0;
  return successState(
    closed === 0
      ? 'Cerramos el ciclo. No había objetivos publicados para cerrar.'
      : `Cerramos el ciclo. Se cerraron ${closed} ${closed === 1 ? 'objetivo' : 'objetivos'} y ${achieved} alcanzaron el umbral.`,
  );
}

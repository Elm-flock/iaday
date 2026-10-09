'use server';

import { updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedApi } from '@/lib/api/client';
import { callApi } from '@/lib/api/call-api';
import { failureMessage } from '@/lib/api/error-copy';
import { errorState, successState, textValues, type FormState } from '@/lib/actions/form-state';
import { KR_ERROR_COPY, OBJECTIVE_ERROR_COPY } from './messages';
import {
  parseCreateKr,
  parseCreateObjective,
  parseUpdateKr,
  parseUpdateObjective,
} from './objective-form-data';

const FIX_FIELDS = 'Revisá los campos marcados y probá de nuevo.';

/** La autorización real es de Nest. Acá se invalida la cache de lo que cambió (lista, detalle y mezcla 50/50 de equipos). */
function invalidate(id?: string) {
  updateTag('okrs');
  if (id) updateTag(`objective:${id}`);
}

/** Crea el objetivo en borrador y va a su detalle para cargar los resultados clave. */
export async function createObjectiveAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = textValues(formData);
  const parsed = parseCreateObjective(formData);
  if (!parsed.ok) return errorState(FIX_FIELDS, { fieldErrors: parsed.fieldErrors, values });

  const client = await authedApi();
  const result = await callApi(() => client.POST('/objectives', { body: parsed.body }));
  if (!result.ok) {
    return errorState(failureMessage(result.failure, OBJECTIVE_ERROR_COPY), { values });
  }

  invalidate();
  redirect(`/objetivos/${result.data?.id ?? ''}`);
}

export async function updateObjectiveAction(
  id: string,
  kindEditable: boolean,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = textValues(formData);
  const parsed = parseUpdateObjective(formData, kindEditable);
  if (!parsed.ok) return errorState(FIX_FIELDS, { fieldErrors: parsed.fieldErrors, values });

  const client = await authedApi();
  const result = await callApi(() =>
    client.PATCH('/objectives/{id}', { params: { path: { id } }, body: parsed.body }),
  );
  if (!result.ok) {
    return errorState(failureMessage(result.failure, OBJECTIVE_ERROR_COPY), { values });
  }

  invalidate(id);
  return successState('Guardamos los cambios del objetivo.');
}

/** Solo borradores (el back devuelve 409 OBJECTIVE_NOT_DRAFT si ya se publicó). */
export async function deleteObjectiveAction(id: string): Promise<FormState> {
  const client = await authedApi();
  const result = await callApi(() =>
    client.DELETE('/objectives/{id}', { params: { path: { id } } }),
  );
  if (!result.ok) return errorState(failureMessage(result.failure, OBJECTIVE_ERROR_COPY));

  invalidate(id);
  redirect('/objetivos');
}

export async function publishObjectiveAction(id: string): Promise<FormState> {
  const client = await authedApi();
  const result = await callApi(() =>
    client.POST('/objectives/{id}/publish', { params: { path: { id } } }),
  );
  if (!result.ok) return errorState(failureMessage(result.failure, OBJECTIVE_ERROR_COPY));

  invalidate(id);
  return successState('Publicamos el objetivo. Ya lo puede ver todo el equipo.');
}

export async function createKeyResultAction(
  objectiveId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = textValues(formData);
  const parsed = parseCreateKr(formData);
  if (!parsed.ok) return errorState(FIX_FIELDS, { fieldErrors: parsed.fieldErrors, values });

  const client = await authedApi();
  const result = await callApi(() =>
    client.POST('/objectives/{id}/key-results', {
      params: { path: { id: objectiveId } },
      body: parsed.body,
    }),
  );
  if (!result.ok) return errorState(failureMessage(result.failure, KR_ERROR_COPY), { values });

  invalidate(objectiveId);
  return successState(`Agregamos el resultado clave "${parsed.body.title}".`);
}

export async function updateKeyResultAction(
  objectiveId: string,
  krId: string,
  opts: { scoring: 'DERIVED' | 'MANUAL'; targetEditable: boolean },
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = textValues(formData);
  const parsed = parseUpdateKr(formData, opts);
  if (!parsed.ok) return errorState(FIX_FIELDS, { fieldErrors: parsed.fieldErrors, values });

  const client = await authedApi();
  const result = await callApi(() =>
    client.PATCH('/key-results/{id}', { params: { path: { id: krId } }, body: parsed.body }),
  );
  if (!result.ok) return errorState(failureMessage(result.failure, KR_ERROR_COPY), { values });

  invalidate(objectiveId);
  return successState('Guardamos los cambios del resultado clave.');
}

export async function deleteKeyResultAction(objectiveId: string, krId: string): Promise<FormState> {
  const client = await authedApi();
  const result = await callApi(() =>
    client.DELETE('/key-results/{id}', { params: { path: { id: krId } } }),
  );
  if (!result.ok) return errorState(failureMessage(result.failure, KR_ERROR_COPY));

  invalidate(objectiveId);
  return successState('Quitamos el resultado clave.');
}

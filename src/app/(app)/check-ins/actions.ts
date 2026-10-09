'use server';

import { updateTag } from 'next/cache';
import { authedApi } from '@/lib/api/client';
import { callApi } from '@/lib/api/call-api';
import { failureMessage } from '@/lib/api/error-copy';
import { errorState, successState, textValues, type FormState } from '@/lib/actions/form-state';
import { parseCheckIn } from './check-in-form-data';
import { CHECK_IN_ERROR_COPY } from './messages';

/** Registra un check-in. Invalida lo que cambia: objetivo (score/banda), KR (historial), lista y pendientes. */
export async function createCheckInAction(
  target: { objectiveId: string; krId: string; scoring: 'DERIVED' | 'MANUAL' },
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = textValues(formData);
  const parsed = parseCheckIn(formData, target.scoring);
  if (!parsed.ok) {
    return errorState('Revisá los campos marcados y probá de nuevo.', {
      fieldErrors: parsed.fieldErrors,
      values,
    });
  }

  const client = await authedApi();
  const result = await callApi(() =>
    client.POST('/key-results/{id}/check-ins', {
      params: { path: { id: target.krId } },
      body: parsed.body,
    }),
  );
  if (!result.ok) {
    return errorState(failureMessage(result.failure, CHECK_IN_ERROR_COPY), { values });
  }

  updateTag('okrs');
  updateTag(`objective:${target.objectiveId}`);
  updateTag(`kr:${target.krId}`);
  updateTag('check-ins:pending');
  return successState('Registramos tu check-in. El puntaje ya está actualizado.');
}

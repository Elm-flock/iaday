'use server';

import { updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedApi } from '@/lib/api/client';
import { callApi } from '@/lib/api/call-api';
import { failureMessage } from '@/lib/api/error-copy';
import { errorState, textValues, type FormState } from '@/lib/actions/form-state';
import { RECOGNITION_ERROR_COPY } from './messages';
import { parseCreateRecognition } from './recognition-form-data';

/** Reconoce un logro. El muro es público: se invalida su cache (`recognitions`) y se vuelve a él. */
export async function createRecognitionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = textValues(formData);
  const parsed = parseCreateRecognition(formData);
  if (!parsed.ok) {
    return errorState('Revisá los campos marcados y probá de nuevo.', {
      fieldErrors: parsed.fieldErrors,
      values,
    });
  }

  const client = await authedApi();
  const result = await callApi(() => client.POST('/recognitions', { body: parsed.body }));
  if (!result.ok) {
    return errorState(failureMessage(result.failure, RECOGNITION_ERROR_COPY), { values });
  }

  updateTag('recognitions');
  redirect('/reconocimientos?creado=1');
}

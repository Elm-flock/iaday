'use server';

import { updateTag } from 'next/cache';
import { authedApi } from '@/lib/api/client';
import { callApi } from '@/lib/api/call-api';
import { failureMessage } from '@/lib/api/error-copy';
import { errorState, successState, textValues, type FormState } from '@/lib/actions/form-state';
import { USER_ERROR_COPY } from './messages';
import { parseCreateUser, parsePassword, parseUpdateUser } from './user-form-data';

const SECRETS = ['password'];

/** La autorización real (solo ADMIN) es de Nest. Acá se invalida la cache de lo que cambió. */
function invalidateUsers() {
  updateTag('users');
  // Nombres de integrantes (equipos) y datos de sesión pueden haber cambiado.
  updateTag('teams');
  updateTag('me');
}

export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = textValues(formData, SECRETS);
  const parsed = parseCreateUser(formData);
  if (!parsed.ok) {
    return errorState('Revisá los campos marcados y probá de nuevo.', {
      fieldErrors: parsed.fieldErrors,
      values,
    });
  }

  const client = await authedApi();
  const result = await callApi(() => client.POST('/users', { body: parsed.body }));
  if (!result.ok) return errorState(failureMessage(result.failure, USER_ERROR_COPY), { values });

  invalidateUsers();
  return successState(`Creamos el usuario de ${parsed.body.name}.`);
}

export async function updateUserAction(
  id: string,
  self: boolean,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = textValues(formData, SECRETS);
  const parsed = parseUpdateUser(formData, { self });
  if (!parsed.ok) {
    return errorState('Revisá los campos marcados y probá de nuevo.', {
      fieldErrors: parsed.fieldErrors,
      values,
    });
  }

  const client = await authedApi();
  const result = await callApi(() =>
    client.PATCH('/users/{id}', { params: { path: { id } }, body: parsed.body }),
  );
  if (!result.ok) return errorState(failureMessage(result.failure, USER_ERROR_COPY), { values });

  invalidateUsers();
  return successState('Guardamos los cambios del usuario.');
}

export async function resetPasswordAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parsePassword(formData);
  if (!parsed.ok) {
    return errorState('Revisá el campo marcado y probá de nuevo.', {
      fieldErrors: parsed.fieldErrors,
    });
  }

  const client = await authedApi();
  const result = await callApi(() =>
    client.POST('/users/{id}/password', { params: { path: { id } }, body: parsed.body }),
  );
  if (!result.ok) return errorState(failureMessage(result.failure, USER_ERROR_COPY));

  // No cambia datos visibles: no hace falta invalidar nada.
  return successState('Cambiamos la contraseña. Compartísela a la persona por un canal seguro.');
}

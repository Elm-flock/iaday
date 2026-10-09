'use server';

import { updateTag } from 'next/cache';
import { authedApi } from '@/lib/api/client';
import { callApi } from '@/lib/api/call-api';
import { failureMessage } from '@/lib/api/error-copy';
import { errorState, successState, textValues, type FormState } from '@/lib/actions/form-state';
import { MEMBER_ERROR_COPY, TEAM_ERROR_COPY } from './messages';

const NAME_MAX = 120;

function validName(formData: FormData): { name: string } | { error: string } {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'Ingresá un nombre para el equipo.' };
  if (name.length > NAME_MAX)
    return { error: `El nombre puede tener hasta ${NAME_MAX} caracteres.` };
  return { name };
}

/** La autorización real (solo ADMIN) es de Nest. Acá se invalida la cache de lo que cambió. */
function invalidateTeams(id?: string) {
  updateTag('teams');
  if (id) updateTag(`team:${id}`);
}

export async function createTeamAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = textValues(formData);
  const name = validName(formData);
  const parentId = String(formData.get('parentId') ?? '');
  const fieldErrors: Record<string, string> = {};
  if ('error' in name) fieldErrors.name = name.error;
  if (!parentId) fieldErrors.parentId = 'Elegí el equipo al que pertenece.';
  if (Object.keys(fieldErrors).length > 0 || 'error' in name) {
    return errorState('Revisá los campos marcados y probá de nuevo.', { fieldErrors, values });
  }

  const client = await authedApi();
  const result = await callApi(() =>
    client.POST('/teams', { body: { name: name.name, parentId } }),
  );
  if (!result.ok) return errorState(failureMessage(result.failure, TEAM_ERROR_COPY), { values });

  invalidateTeams();
  return successState(`Creamos el equipo "${name.name}".`);
}

export async function updateTeamAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = textValues(formData);
  const name = validName(formData);
  if ('error' in name) {
    return errorState('Revisá los campos marcados y probá de nuevo.', {
      fieldErrors: { name: name.error },
      values,
    });
  }
  // El equipo raíz no tiene selector de padre: no se envía `parentId`.
  const parentId = String(formData.get('parentId') ?? '');

  const client = await authedApi();
  const result = await callApi(() =>
    client.PATCH('/teams/{id}', {
      params: { path: { id } },
      body: { name: name.name, ...(parentId ? { parentId } : {}) },
    }),
  );
  if (!result.ok) return errorState(failureMessage(result.failure, TEAM_ERROR_COPY), { values });

  invalidateTeams(id);
  updateTag('me'); // el nombre del equipo viaja en la sesión (MeTeamDto)
  return successState('Guardamos los cambios del equipo.');
}

export async function addMemberAction(
  teamId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const userId = String(formData.get('userId') ?? '');
  const isLead = formData.get('isLead') === 'on';
  if (!userId) {
    return errorState('Elegí a la persona que querés agregar.', {
      fieldErrors: { userId: 'Elegí una persona.' },
    });
  }

  const client = await authedApi();
  const result = await callApi(() =>
    client.PUT('/teams/{id}/members/{userId}', {
      params: { path: { id: teamId, userId } },
      body: { isLead },
    }),
  );
  if (!result.ok) return errorState(failureMessage(result.failure, MEMBER_ERROR_COPY));

  invalidateTeams(teamId);
  updateTag('me');
  return successState(
    isLead ? 'Agregamos a la persona como líder del equipo.' : 'Agregamos a la persona al equipo.',
  );
}

export async function setLeadAction(
  teamId: string,
  userId: string,
  isLead: boolean,
): Promise<FormState> {
  const client = await authedApi();
  const result = await callApi(() =>
    client.PUT('/teams/{id}/members/{userId}', {
      params: { path: { id: teamId, userId } },
      body: { isLead },
    }),
  );
  if (!result.ok) return errorState(failureMessage(result.failure, MEMBER_ERROR_COPY));

  invalidateTeams(teamId);
  updateTag('me');
  return successState(isLead ? 'Ahora es líder del equipo.' : 'Dejó de ser líder del equipo.');
}

export async function removeMemberAction(teamId: string, userId: string): Promise<FormState> {
  const client = await authedApi();
  const result = await callApi(() =>
    client.DELETE('/teams/{id}/members/{userId}', { params: { path: { id: teamId, userId } } }),
  );
  if (!result.ok) return errorState(failureMessage(result.failure, MEMBER_ERROR_COPY));

  invalidateTeams(teamId);
  updateTag('me');
  return successState('Quitamos a la persona del equipo.');
}

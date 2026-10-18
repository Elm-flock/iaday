'use server';

import { updateTag } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authedApi, publicApi } from '@/lib/api/client';
import { callApi } from '@/lib/api/call-api';
import { failureMessage } from '@/lib/api/error-copy';
import { errorState, textValues, type FormState } from '@/lib/actions/form-state';
import {
  ACCESS_COOKIE,
  CHANGE_PASSWORD_PATH,
  REFRESH_COOKIE,
  RETRY_COOKIE,
  cookieOptions,
  sessionMaxAges,
} from '@/lib/auth/constants';
import { CHANGE_PASSWORD_COPY, LOGIN_MESSAGES } from './messages';
import { parseChangePassword } from './password-form-data';
import { safeNext } from '@/lib/auth/redirect';

export type LoginState = {
  /** Qué pasó + cómo seguir. */
  message?: string;
  /** Se devuelve para no perder lo tipeado (el password nunca vuelve). */
  email?: string;
};

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = safeNext(formData.get('next'));

  if (!email || !password) return { message: LOGIN_MESSAGES.empty, email };

  let result;
  try {
    result = await publicApi().POST('/auth/login', { body: { email, password } });
  } catch {
    return { message: LOGIN_MESSAGES.unavailable, email };
  }

  // Mismo mensaje para cualquier 401: sin enumeración de usuarios.
  if (result.response.status === 401) return { message: LOGIN_MESSAGES.invalid, email };
  if (result.response.status === 429) return { message: LOGIN_MESSAGES.throttled, email };
  if (!result.data) return { message: LOGIN_MESSAGES.unavailable, email };

  const session = result.data;
  const maxAge = sessionMaxAges(session);
  const store = await cookies();
  store.set(ACCESS_COOKIE, session.accessToken, cookieOptions(maxAge.access));
  store.set(REFRESH_COOKIE, session.refreshToken, cookieOptions(maxAge.refresh));
  store.delete(RETRY_COOKIE);

  // Clave inicial sin cambiar: lo único que puede hacer es cambiarla (el back lo exige igual).
  if (session.user.mustChangePassword) {
    redirect(
      next === '/'
        ? CHANGE_PASSWORD_PATH
        : `${CHANGE_PASSWORD_PATH}?next=${encodeURIComponent(next)}`,
    );
  }
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    try {
      await publicApi().POST('/auth/logout', { body: { refreshToken } });
    } catch {
      // Best effort: igual se borran las cookies locales.
    }
  }

  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
  store.delete(RETRY_COOKIE);
  redirect('/login');
}

/**
 * Cambio de contraseña propio (obligatorio con la clave inicial, o voluntario desde el menú).
 * El back revoca las demás sesiones y devuelve una sesión nueva: se reemplazan las cookies.
 */
export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = textValues(formData, ['currentPassword', 'newPassword', 'confirmPassword']);
  const parsed = parseChangePassword(formData);
  if (!parsed.ok) {
    return errorState('Revisá los campos marcados y probá de nuevo.', {
      fieldErrors: parsed.fieldErrors,
      values,
    });
  }

  const client = await authedApi();
  const result = await callApi(() => client.POST('/auth/change-password', { body: parsed.body }));
  if (!result.ok) {
    const message = failureMessage(result.failure, CHANGE_PASSWORD_COPY);
    return errorState(message, { values });
  }
  if (!result.data) return errorState(failureMessage({ status: 500 }), { values });

  const session = result.data;
  const maxAge = sessionMaxAges(session);
  const store = await cookies();
  store.set(ACCESS_COOKIE, session.accessToken, cookieOptions(maxAge.access));
  store.set(REFRESH_COOKIE, session.refreshToken, cookieOptions(maxAge.refresh));
  store.delete(RETRY_COOKIE);
  updateTag('me');

  redirect(safeNext(formData.get('next')));
}

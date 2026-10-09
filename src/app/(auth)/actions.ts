'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { publicApi } from '@/lib/api/client';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  RETRY_COOKIE,
  cookieOptions,
  sessionMaxAges,
} from '@/lib/auth/constants';
import { LOGIN_MESSAGES } from './messages';
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

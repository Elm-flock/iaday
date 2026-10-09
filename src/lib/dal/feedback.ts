import 'server-only';
import { connection } from 'next/server';
import { authedApi } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';
import type { components } from '@/lib/api/schema';

export type Feedback = components['schemas']['FeedbackDto'];
export type FeedbackBox = 'received' | 'sent';

/*
 * PRIVACIDAD: el feedback es entre dos personas. Este DAL NO usa ninguna cache (ni `'use cache'`,
 * ni `'use cache: private'`, ni `unstable_cache`): son lecturas dinámicas por request, siempre
 * dentro de <Suspense>, y el contenido nunca se guarda ni se etiqueta. Tampoco se loguea nada.
 * La autorización real es del back (el WHERE filtra por emisor/receptor; lo ajeno es 404).
 */

/** Mi feedback recibido o enviado, del más nuevo al más viejo. */
export async function listFeedback(box: FeedbackBox): Promise<Feedback[]> {
  // Siempre dinámico: sin cache y sin prerender; el fetch corre solo en la request de la persona.
  await connection();
  const client = await authedApi();
  return unwrap(await client.GET('/feedback', { params: { query: { box } } }));
}

/** Un feedback mío (emisor o receptor), o `null` si no existe / no es mío (404) / id inválido. */
export async function getFeedback(id: string): Promise<Feedback | null> {
  // Siempre dinámico: sin cache y sin prerender; el fetch corre solo en la request de la persona.
  await connection();
  const client = await authedApi();
  const result = await client.GET('/feedback/{id}', { params: { path: { id } } });
  if (result.response.status === 404 || result.response.status === 400) return null;
  return unwrap(result);
}

import type { components } from '@/lib/api/schema';
import { decodeLink } from '@/lib/okr-link';
import type { Parsed } from '../objetivos/objective-form-data';
import { CONTENT_MAX } from './messages';

type CreateFeedback = components['schemas']['CreateFeedbackDto'];
type UpdateFeedback = components['schemas']['UpdateFeedbackDto'];

const str = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim();

function contentError(content: string): string | undefined {
  if (!content) return 'Escribí el mensaje: contá qué viste y qué impacto tuvo.';
  if (content.length > CONTENT_MAX)
    return `El mensaje puede tener hasta ${CONTENT_MAX} caracteres.`;
  return undefined;
}

export function parseCreateFeedback(fd: FormData): Parsed<CreateFeedback> {
  const fieldErrors: Record<string, string> = {};
  const toUserId = str(fd, 'toUserId');
  const content = str(fd, 'content');
  if (!toUserId) fieldErrors.toUserId = 'Elegí a quién le querés dar feedback.';
  const error = contentError(content);
  if (error) fieldErrors.content = error;
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  const link = decodeLink(str(fd, 'link'));
  return { ok: true, body: { toUserId, content, ...(link ?? {}) } };
}

export function parseUpdateFeedback(fd: FormData): Parsed<UpdateFeedback> {
  const content = str(fd, 'content');
  const error = contentError(content);
  if (error) return { ok: false, fieldErrors: { content: error } };
  return { ok: true, body: { content } };
}

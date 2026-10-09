import type { components } from '@/lib/api/schema';
import { decodeLink } from '@/lib/okr-link';
import type { Parsed } from '../objetivos/objective-form-data';
import { MESSAGE_MAX } from './messages';

type CreateRecognition = components['schemas']['CreateRecognitionDto'];

const str = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim();

export function parseCreateRecognition(fd: FormData): Parsed<CreateRecognition> {
  const fieldErrors: Record<string, string> = {};
  const toUserId = str(fd, 'toUserId');
  const message = str(fd, 'message');
  const link = decodeLink(str(fd, 'milestone'));

  if (!toUserId) fieldErrors.toUserId = 'Elegí a quién querés reconocer.';
  if (!link) fieldErrors.milestone = 'Elegí el logro que querés reconocer.';
  if (!message) fieldErrors.message = 'Escribí unas palabras: qué hizo y por qué importa.';
  else if (message.length > MESSAGE_MAX) {
    fieldErrors.message = `El mensaje puede tener hasta ${MESSAGE_MAX} caracteres.`;
  }
  if (Object.keys(fieldErrors).length > 0 || !link) return { ok: false, fieldErrors };

  return { ok: true, body: { toUserId, message, ...link } };
}

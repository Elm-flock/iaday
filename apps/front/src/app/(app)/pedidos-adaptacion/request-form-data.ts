import type { components } from '@/lib/api/schema';
import {
  DESCRIPTION_MAX,
  ENTITY_BY_ROUTE,
  NOTE_MIN,
  REJECTION_MIN,
  SUBJECT_MAX,
  SUBJECT_MIN,
  TEXT_MAX,
  isFormat,
  isLinkableRoute,
} from './messages';

type CreateBody = components['schemas']['CreateAdaptationRequestDto'];
type Parsed<T> = { ok: true; body: T } | { ok: false; fieldErrors: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (formData: FormData, key: string) => String(formData.get(key) ?? '').trim();

/** Pedido de documento adaptado: asunto, formato y, si viene, el elemento vinculado (tipo + id). */
export function parseCreateRequest(formData: FormData): Parsed<CreateBody> {
  const fieldErrors: Record<string, string> = {};
  const subject = text(formData, 'subject');
  const description = text(formData, 'description');
  const preferredFormat = text(formData, 'preferredFormat');
  const route = text(formData, 'linkType');
  const entityId = text(formData, 'linkId');

  if (subject.length < SUBJECT_MIN) fieldErrors.subject = 'Contá en pocas palabras qué necesitás.';
  else if (subject.length > SUBJECT_MAX)
    fieldErrors.subject = `El asunto puede tener hasta ${SUBJECT_MAX} caracteres.`;
  if (description.length > DESCRIPTION_MAX)
    fieldErrors.description = `El detalle puede tener hasta ${DESCRIPTION_MAX} caracteres.`;
  if (!isFormat(preferredFormat)) fieldErrors.preferredFormat = 'Elegí el formato que te sirve.';
  const hasLink = route !== '' || entityId !== '';
  if (hasLink && !(isLinkableRoute(route) && UUID.test(entityId))) {
    fieldErrors.link = 'No pudimos identificar el elemento vinculado. Probá sin vincularlo.';
  }
  if (Object.keys(fieldErrors).length > 0 || !isFormat(preferredFormat)) {
    return { ok: false, fieldErrors };
  }
  return {
    ok: true,
    body: {
      subject,
      preferredFormat,
      ...(description ? { description } : {}),
      ...(hasLink && isLinkableRoute(route)
        ? { entityType: ENTITY_BY_ROUTE[route], entityId }
        : {}),
    },
  };
}

const UUID_RE = UUID;

export function parseAssign(formData: FormData): Parsed<{ assigneeId: string }> {
  const assigneeId = text(formData, 'assigneeId');
  if (!UUID_RE.test(assigneeId)) {
    return { ok: false, fieldErrors: { assigneeId: 'Elegí a la persona que se hace cargo.' } };
  }
  return { ok: true, body: { assigneeId } };
}

export function parseDeliver(
  formData: FormData,
): Parsed<{ resolutionNote: string; resolutionLink?: string }> {
  const fieldErrors: Record<string, string> = {};
  const resolutionNote = text(formData, 'resolutionNote');
  const resolutionLink = text(formData, 'resolutionLink');
  if (resolutionNote.length < NOTE_MIN)
    fieldErrors.resolutionNote = `Contá qué entregás y cómo acceder a eso (al menos ${NOTE_MIN} caracteres).`;
  else if (resolutionNote.length > TEXT_MAX)
    fieldErrors.resolutionNote = `La nota puede tener hasta ${TEXT_MAX} caracteres.`;
  if (resolutionLink) {
    try {
      const url = new URL(resolutionLink);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocolo');
    } catch {
      fieldErrors.resolutionLink = 'Ingresá un enlace completo que empiece con https://.';
    }
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, body: { resolutionNote, ...(resolutionLink ? { resolutionLink } : {}) } };
}

export function parseReject(formData: FormData): Parsed<{ justification: string }> {
  const justification = text(formData, 'justification');
  if (justification.length < REJECTION_MIN) {
    return {
      ok: false,
      fieldErrors: {
        justification: `Para rechazar hace falta una justificación por escrito, en lenguaje claro (al menos ${REJECTION_MIN} caracteres).`,
      },
    };
  }
  if (justification.length > TEXT_MAX) {
    return {
      ok: false,
      fieldErrors: { justification: `Puede tener hasta ${TEXT_MAX} caracteres.` },
    };
  }
  return { ok: true, body: { justification } };
}

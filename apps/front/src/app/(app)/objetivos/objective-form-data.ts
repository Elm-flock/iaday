import type { components } from '@/lib/api/schema';

type CreateObjective = components['schemas']['CreateObjectiveDto'];
type UpdateObjective = components['schemas']['UpdateObjectiveDto'];
type CreateKr = components['schemas']['CreateKeyResultDto'];
type UpdateKr = components['schemas']['UpdateKeyResultDto'];

export type Parsed<T> = { ok: true; body: T } | { ok: false; fieldErrors: Record<string, string> };

const str = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim();

const TITLE_MIN = 3;
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;
const KR_TITLE_MAX = 200;
const UNIT_MAX = 40;

const NUMBER_HELP_START = 'Ingresá el valor inicial como número, por ejemplo 0 o 12,5.';
const NUMBER_HELP_TARGET = 'Ingresá la meta como número, por ejemplo 100.';
const TARGET_EQUALS_START = 'La meta tiene que ser distinta del inicio.';

function titleError(title: string): string | undefined {
  if (title.length < TITLE_MIN) return `Escribí un título de al menos ${TITLE_MIN} caracteres.`;
  if (title.length > TITLE_MAX) return `El título puede tener hasta ${TITLE_MAX} caracteres.`;
  return undefined;
}

/**
 * Número es-AR (`1.234,5`, `0,7`) o con punto (`0.7`) a string decimal para la API (`1234.5`).
 * `null` si no es un número válido.
 */
export function parseDecimal(raw: string): string | null {
  const text = raw.trim().replace(/\s/g, '');
  if (!text) return null;
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : null;
}

export function parseCreateObjective(fd: FormData): Parsed<CreateObjective> {
  const fieldErrors: Record<string, string> = {};
  const cycleId = str(fd, 'cycleId');
  const [ownerKind, ownerId] = str(fd, 'owner').split(':');
  const title = str(fd, 'title');
  const description = str(fd, 'description');
  const type = str(fd, 'type');
  const origin = str(fd, 'origin');
  const parentObjectiveId = str(fd, 'parentObjectiveId');

  if (!cycleId) fieldErrors.cycleId = 'Elegí el ciclo del objetivo.';
  if (!ownerId || (ownerKind !== 'user' && ownerKind !== 'team')) {
    fieldErrors.owner = 'Elegí quién es responsable del objetivo.';
  }
  const tError = titleError(title);
  if (tError) fieldErrors.title = tError;
  if (description.length > DESCRIPTION_MAX) {
    fieldErrors.description = `La descripción puede tener hasta ${DESCRIPTION_MAX} caracteres.`;
  }
  if (type !== 'COMMITTED' && type !== 'ASPIRATIONAL') {
    fieldErrors.type = 'Elegí el tipo de objetivo.';
  }
  if (origin !== 'TOP_DOWN' && origin !== 'BOTTOM_UP') {
    fieldErrors.origin =
      'Elegí si el objetivo viene de la dirección (top-down) o de las personas (bottom-up).';
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return {
    ok: true,
    body: {
      cycleId,
      title,
      type: type as CreateObjective['type'],
      origin: origin as CreateObjective['origin'],
      ...(ownerKind === 'user' ? { ownerUserId: ownerId } : { ownerTeamId: ownerId }),
      ...(description ? { description } : {}),
      ...(parentObjectiveId ? { parentObjectiveId } : {}),
    },
  };
}

/** `kindEditable`: tipo y origen solo se editan en borrador (los campos deshabilitados no viajan). */
export function parseUpdateObjective(fd: FormData, kindEditable: boolean): Parsed<UpdateObjective> {
  const fieldErrors: Record<string, string> = {};
  const title = str(fd, 'title');
  const description = str(fd, 'description');
  const parentObjectiveId = str(fd, 'parentObjectiveId');

  const tError = titleError(title);
  if (tError) fieldErrors.title = tError;
  if (description.length > DESCRIPTION_MAX) {
    fieldErrors.description = `La descripción puede tener hasta ${DESCRIPTION_MAX} caracteres.`;
  }
  const body: UpdateObjective = {
    title,
    description,
    parentObjectiveId: parentObjectiveId || null,
  };
  if (kindEditable) {
    const type = str(fd, 'type');
    const origin = str(fd, 'origin');
    if (type !== 'COMMITTED' && type !== 'ASPIRATIONAL') {
      fieldErrors.type = 'Elegí el tipo de objetivo.';
    }
    if (origin !== 'TOP_DOWN' && origin !== 'BOTTOM_UP') {
      fieldErrors.origin = 'Elegí el origen del objetivo.';
    }
    body.type = type as UpdateObjective['type'];
    body.origin = origin as UpdateObjective['origin'];
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, body };
}

export function parseCreateKr(fd: FormData): Parsed<CreateKr> {
  const fieldErrors: Record<string, string> = {};
  const title = str(fd, 'title');
  const scoring = str(fd, 'scoring');
  const ownerId = str(fd, 'ownerId');
  const unit = str(fd, 'unit');
  const start = parseDecimal(str(fd, 'startValue'));
  const target = parseDecimal(str(fd, 'targetValue'));

  if (!title) fieldErrors.title = 'Escribí qué resultado querés lograr.';
  else if (title.length > KR_TITLE_MAX) {
    fieldErrors.title = `El título puede tener hasta ${KR_TITLE_MAX} caracteres.`;
  }
  if (scoring !== 'DERIVED' && scoring !== 'MANUAL') fieldErrors.scoring = 'Elegí cómo se mide.';
  if (!ownerId) fieldErrors.ownerId = 'Elegí quién es responsable del resultado clave.';
  if (unit.length > UNIT_MAX) {
    fieldErrors.unit = `La unidad puede tener hasta ${UNIT_MAX} caracteres.`;
  }
  if (scoring === 'DERIVED') {
    if (start === null) fieldErrors.startValue = NUMBER_HELP_START;
    if (target === null) fieldErrors.targetValue = NUMBER_HELP_TARGET;
    if (start !== null && target !== null && Number(start) === Number(target)) {
      fieldErrors.targetValue = TARGET_EQUALS_START;
    }
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  return {
    ok: true,
    body: {
      title,
      scoring: scoring as CreateKr['scoring'],
      ownerId,
      ...(unit ? { unit } : {}),
      ...(scoring === 'DERIVED'
        ? { startValue: start as string, targetValue: target as string }
        : {}),
    },
  };
}

/**
 * `scoring` y `targetEditable` salen del KR existente: un MANUAL no lleva valores y, si inicio/meta
 * están bloqueados (objetivo publicado y sin permiso), no se envían.
 */
export function parseUpdateKr(
  fd: FormData,
  opts: { scoring: 'DERIVED' | 'MANUAL'; targetEditable: boolean },
): Parsed<UpdateKr> {
  const fieldErrors: Record<string, string> = {};
  const title = str(fd, 'title');
  const ownerId = str(fd, 'ownerId');
  const unit = str(fd, 'unit');

  if (!title) fieldErrors.title = 'Escribí qué resultado querés lograr.';
  else if (title.length > KR_TITLE_MAX) {
    fieldErrors.title = `El título puede tener hasta ${KR_TITLE_MAX} caracteres.`;
  }
  if (unit.length > UNIT_MAX) {
    fieldErrors.unit = `La unidad puede tener hasta ${UNIT_MAX} caracteres.`;
  }

  const body: UpdateKr = { title, unit: unit || null, ...(ownerId ? { ownerId } : {}) };
  if (opts.scoring === 'DERIVED' && opts.targetEditable) {
    const start = parseDecimal(str(fd, 'startValue'));
    const target = parseDecimal(str(fd, 'targetValue'));
    if (start === null) fieldErrors.startValue = NUMBER_HELP_START;
    if (target === null) fieldErrors.targetValue = NUMBER_HELP_TARGET;
    if (start !== null && target !== null && Number(start) === Number(target)) {
      fieldErrors.targetValue = TARGET_EQUALS_START;
    }
    if (start !== null) body.startValue = start;
    if (target !== null) body.targetValue = target;
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, body };
}

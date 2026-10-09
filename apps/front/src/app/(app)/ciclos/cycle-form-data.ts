import type { components } from '@/lib/api/schema';

type CreateBody = components['schemas']['CreateCycleDto'];
type UpdateBody = components['schemas']['UpdateCycleDto'];

export type ParseResult<T> =
  { ok: true; body: T } | { ok: false; fieldErrors: Record<string, string> };

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const CADENCES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const;

/** Acepta `0,70` o `0.7`. Devuelve `null` si no es un umbral válido: (0, 1] con hasta 2 decimales. */
export function parseThreshold(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (!/^\d(\.\d{1,2})?$|^0?\.\d{1,2}$/.test(text)) return null;
  const value = Number(text);
  return value > 0 && value <= 1 ? value : null;
}

const THRESHOLD_ERROR =
  'Ingresá un número mayor a 0 y hasta 1, con hasta 2 decimales (por ejemplo 0,70).';

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

type Shared = {
  name: string;
  startDate?: string;
  endDate?: string;
  checkInCadence: (typeof CADENCES)[number];
  committedThreshold: number;
  aspirationalThreshold: number;
};

function parseShared(
  formData: FormData,
  { dates }: { dates: boolean },
): { ok: true; value: Shared } | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};

  const name = field(formData, 'name');
  if (!name) fieldErrors.name = 'Ingresá un nombre para el ciclo.';
  else if (name.length > 120) fieldErrors.name = 'El nombre puede tener hasta 120 caracteres.';

  let startDate: string | undefined;
  let endDate: string | undefined;
  if (dates) {
    startDate = field(formData, 'startDate');
    endDate = field(formData, 'endDate');
    if (!DATE_ONLY.test(startDate)) fieldErrors.startDate = 'Elegí la fecha de inicio.';
    if (!DATE_ONLY.test(endDate)) fieldErrors.endDate = 'Elegí la fecha de fin.';
    if (!fieldErrors.startDate && !fieldErrors.endDate && startDate >= endDate) {
      fieldErrors.endDate = 'La fecha de fin tiene que ser posterior a la de inicio.';
    }
  }

  const cadence = field(formData, 'checkInCadence') || 'WEEKLY';
  if (!(CADENCES as readonly string[]).includes(cadence)) {
    fieldErrors.checkInCadence = 'Elegí una cadencia de check-in.';
  }

  const committed = parseThreshold(field(formData, 'committedThreshold'));
  if (committed === null) fieldErrors.committedThreshold = THRESHOLD_ERROR;
  const aspirational = parseThreshold(field(formData, 'aspirationalThreshold'));
  if (aspirational === null) fieldErrors.aspirationalThreshold = THRESHOLD_ERROR;

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return {
    ok: true,
    value: {
      name,
      startDate,
      endDate,
      checkInCadence: cadence as Shared['checkInCadence'],
      committedThreshold: committed!,
      aspirationalThreshold: aspirational!,
    },
  };
}

export function parseCreateCycle(formData: FormData): ParseResult<CreateBody> {
  const kind = field(formData, 'kind');
  const parentId = field(formData, 'parentId');
  const fieldErrors: Record<string, string> = {};
  if (kind !== 'ANNUAL' && kind !== 'QUARTER') fieldErrors.kind = 'Elegí si es anual o trimestral.';
  if (kind === 'QUARTER' && !parentId)
    fieldErrors.parentId = 'Elegí el ciclo anual al que pertenece.';

  const shared = parseShared(formData, { dates: true });
  if (!shared.ok) Object.assign(fieldErrors, shared.fieldErrors);
  if (!shared.ok || Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  const { startDate, endDate, ...rest } = shared.value;
  return {
    ok: true,
    body: {
      ...rest,
      kind: kind as CreateBody['kind'],
      startDate: startDate!,
      endDate: endDate!,
      ...(kind === 'QUARTER' ? { parentId } : {}),
    },
  };
}

/** `datesEditable`: solo los ciclos en borrador permiten cambiar fechas. */
export function parseUpdateCycle(
  formData: FormData,
  { datesEditable }: { datesEditable: boolean },
): ParseResult<UpdateBody> {
  const shared = parseShared(formData, { dates: datesEditable });
  if (!shared.ok) return shared;
  const { startDate, endDate, ...rest } = shared.value;
  return { ok: true, body: { ...rest, ...(datesEditable ? { startDate, endDate } : {}) } };
}

import { isManualStep } from '@/lib/check-in-preview';
import type { components } from '@/lib/api/schema';
import { parseDecimal, type Parsed } from '../objetivos/objective-form-data';
import { NOTE_MAX } from './messages';

type CreateCheckIn = components['schemas']['CreateCheckInDto'];

const ACTIONS = ['CONTINUE', 'UPDATE', 'START', 'STOP'] as const;
const str = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim();

/**
 * Valida el check-in según el tipo de KR: numérico lleva `value` (decimal es-AR), manual lleva
 * `manualScore` (0 a 1 en pasos de 0,1). La nota es opcional (hasta 2000).
 */
export function parseCheckIn(fd: FormData, scoring: 'DERIVED' | 'MANUAL'): Parsed<CreateCheckIn> {
  const fieldErrors: Record<string, string> = {};
  const action = str(fd, 'action');
  const note = str(fd, 'note');

  if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) {
    fieldErrors.action = 'Elegí qué vas a hacer: continuar, actualizar, iniciar o detener.';
  }
  if (note.length > NOTE_MAX) {
    fieldErrors.note = `La nota puede tener hasta ${NOTE_MAX} caracteres.`;
  }

  let value: string | undefined;
  let manualScore: number | undefined;
  if (scoring === 'DERIVED') {
    const parsed = parseDecimal(str(fd, 'value'));
    if (parsed === null) {
      fieldErrors.value = 'Ingresá el valor actual como número, por ejemplo 45 o 12,5.';
    } else {
      value = parsed;
    }
  } else {
    const raw = str(fd, 'manualScore').replace(',', '.');
    const n = raw === '' ? NaN : Number(raw);
    if (!isManualStep(n)) {
      fieldErrors.manualScore = 'Elegí un puntaje de 0,0 a 1,0 en pasos de 0,1.';
    } else {
      manualScore = n;
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return {
    ok: true,
    body: {
      action: action as CreateCheckIn['action'],
      ...(value !== undefined ? { value } : {}),
      ...(manualScore !== undefined ? { manualScore } : {}),
      ...(note ? { note } : {}),
    },
  };
}

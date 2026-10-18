import type { SuggestOkrInput } from './actions';
import type { SuggestedKr } from './suggestion-payload';
import { parseDecimal } from '../objetivos/objective-form-data';
import { formatNumber } from '@/lib/format';

/** Armado (puro) del pedido de "Sugerir redacción" a partir de lo que la persona lleva escrito en el formulario. */

export type BuiltInput = { ok: true; input: SuggestOkrInput } | { ok: false; message: string };

const str = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim();

export const SUGGEST_NEEDS_TITLE =
  'Escribí un borrador del título para que podamos sugerirte una redacción.';
export const SUGGEST_NEEDS_CYCLE_OWNER = 'Elegí el ciclo y el responsable antes de pedir ayuda.';

/** Formulario de alta de objetivo: ciclo + responsable + título/descripción/tipo (sin KRs todavía). */
export function buildObjectiveSuggestInput(fd: FormData): BuiltInput {
  const title = str(fd, 'title');
  if (!title) return { ok: false, message: SUGGEST_NEEDS_TITLE };
  const cycleId = str(fd, 'cycleId');
  const [ownerKind, ownerId] = str(fd, 'owner').split(':');
  if (!cycleId || !ownerId || (ownerKind !== 'user' && ownerKind !== 'team')) {
    return { ok: false, message: SUGGEST_NEEDS_CYCLE_OWNER };
  }
  const description = str(fd, 'description');
  const type = str(fd, 'type') === 'ASPIRATIONAL' ? 'ASPIRATIONAL' : 'COMMITTED';
  return {
    ok: true,
    input: {
      cycleId,
      ...(ownerKind === 'user' ? { ownerUserId: ownerId } : { ownerTeamId: ownerId }),
      draft: { title, type, ...(description ? { description } : {}) },
    },
  };
}

export type ObjectiveContext = {
  id: string;
  cycleId: string;
  title: string;
  description: string | null;
  type: 'COMMITTED' | 'ASPIRATIONAL';
};

/** Modal de KR: el objetivo existente da el contexto y el KR en edición va como único KR del borrador. */
export function buildKrSuggestInput(fd: FormData, objective: ObjectiveContext): BuiltInput {
  const title = str(fd, 'title');
  if (!title) {
    return { ok: false, message: 'Escribí un borrador del resultado clave para pedir ayuda.' };
  }
  const unit = str(fd, 'unit');
  const start = parseDecimal(str(fd, 'startValue'));
  const target = parseDecimal(str(fd, 'targetValue'));
  return {
    ok: true,
    input: {
      cycleId: objective.cycleId,
      objectiveId: objective.id,
      draft: {
        title: objective.title,
        type: objective.type,
        ...(objective.description ? { description: objective.description } : {}),
        keyResults: [
          {
            title,
            ...(unit ? { unit } : {}),
            ...(start !== null ? { startValue: start } : {}),
            ...(target !== null ? { targetValue: target } : {}),
          },
        ],
      },
    },
  };
}

/** `"12.5"` (API) -> `"12,5"` (campo es-AR). */
export function decimalForInput(value: string | null): string {
  if (value === null || value === '' || Number.isNaN(Number(value))) return '';
  return formatNumber(Number(value), Number.isInteger(Number(value)) ? 0 : 2);
}

/** Valores del formulario de KR que se precargan al usar la sugerencia (la persona los revisa y guarda). */
export function krPrefill(kr: SuggestedKr): Record<string, string> {
  return {
    title: kr.title.slice(0, 200),
    unit: (kr.unit ?? '').slice(0, 40),
    startValue: decimalForInput(kr.startValue),
    targetValue: decimalForInput(kr.targetValue),
  };
}

/** Valores del formulario de objetivo que se precargan (respetando los máximos del formulario). */
export function objectivePrefill(objective: {
  title: string;
  description: string | null;
}): Record<string, string> {
  return {
    title: objective.title.slice(0, 200),
    ...(objective.description !== null
      ? { description: objective.description.slice(0, 2000) }
      : {}),
  };
}

/** Valores de texto del formulario (para conservar lo ya tipeado al precargar). */
export function formValues(form: HTMLFormElement | null): Record<string, string> {
  if (!form) return {};
  const values: Record<string, string> = {};
  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value === 'string') values[key] = value;
  }
  return values;
}

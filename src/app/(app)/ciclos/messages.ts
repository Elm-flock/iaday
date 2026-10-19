import type { ErrorCopy } from '@/lib/api/error-copy';

// Fuera de actions.ts: un archivo 'use server' solo puede exportar funciones async.

/** Copy de errores de ciclos por código de dominio del back (400 = pedido incoherente, 422 = regla de negocio). */
export const CYCLE_ERROR_COPY: ErrorCopy = {
  codes: {
    INVALID_DATE_RANGE:
      'La fecha de inicio tiene que ser anterior a la de fin. Corregí las fechas y probá de nuevo.',
    ANNUAL_CANNOT_HAVE_PARENT:
      'Un ciclo anual no puede pertenecer a otro ciclo. Quitá el ciclo padre o elegí "Trimestral".',
    QUARTER_REQUIRES_ANNUAL_PARENT:
      'Un trimestre tiene que pertenecer a un ciclo anual. Elegí el ciclo anual correspondiente.',
    QUARTER_OUT_OF_PARENT_RANGE:
      'Las fechas del trimestre tienen que estar dentro de las del ciclo anual. Ajustá el inicio o el fin.',
    QUARTER_OVERLAPS_SIBLING:
      'Ese trimestre se superpone con otro del mismo ciclo anual. Elegí fechas que no se pisen con los trimestres existentes.',
    INVALID_THRESHOLD:
      'Los umbrales tienen que ser mayores a 0 y hasta 1 (por ejemplo 1,00 y 0,70). Corregilos y probá de nuevo.',
    CYCLE_NAME_TAKEN: 'Ya existe un ciclo con ese nombre. Elegí otro nombre o usá el existente.',
    INVALID_CYCLE_TRANSITION:
      'Ese ciclo ya cambió de estado y no se puede hacer esta acción. Recargá la página para ver su estado actual.',
  },
  statuses: {
    404: 'No encontramos el ciclo. Puede que ya no exista: volvé a la lista de ciclos.',
    409: 'El ciclo ya está cerrado o cambió de estado y no admite este cambio. Recargá la página para ver su estado actual.',
  },
};

/** Error de campo para el nombre repetido (el back compara sin espacios, mayúsculas ni tildes). */
export const cycleNameTakenCopy = (name: string): string =>
  `Ya existe un ciclo llamado «${name.trim()}». Elegí otro nombre o usá el existente.`;

export const CYCLE_STATUS_LABEL = {
  DRAFT: 'Borrador',
  ACTIVE: 'Activo',
  CLOSED: 'Cerrado',
} as const;

export const CYCLE_KIND_LABEL = { ANNUAL: 'Anual', QUARTER: 'Trimestral' } as const;

export const CADENCE_LABEL = {
  WEEKLY: 'Semanal',
  BIWEEKLY: 'Quincenal',
  MONTHLY: 'Mensual',
} as const;

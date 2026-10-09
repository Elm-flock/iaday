import type { ErrorCopy } from '@/lib/api/error-copy';

// Fuera de actions.ts: un archivo 'use server' solo puede exportar funciones async.

export const OBJECTIVE_MIN = 3;
export const OBJECTIVE_MAX = 5;
export const KR_MIN = 3;
export const KR_MAX = 5;

/** Códigos de dominio de `okrs.errors.ts` del back -> copy es-AR (qué pasó + cómo seguir). Cubre TODOS. */
export const OKR_CODE_COPY: Record<string, string> = {
  // 400: pedido incoherente
  ALIGNMENT_SELF_PARENT:
    'Un objetivo no puede alinearse consigo mismo. Elegí otro objetivo publicado como padre o dejá la alineación vacía.',
  ALIGNMENT_CYCLE:
    'Esa alineación formaría un círculo: el objetivo elegido ya depende de este. Elegí otro objetivo como padre.',
  INVALID_MANUAL_SCORE:
    'El puntaje de un resultado clave manual va de 0 a 1 en pasos de 0,1. Corregilo y probá de nuevo.',
  INVALID_KR_RANGE:
    'El inicio y la meta no pueden ser iguales: el resultado clave necesita un recorrido para medir avance. Cambiá alguno de los dos valores.',
  KR_VALUES_REQUIRED:
    'Un resultado clave numérico necesita valor inicial y meta. Completá los dos campos.',
  KR_VALUES_NOT_ALLOWED:
    'Un resultado clave manual (se cumple o no) no lleva inicio ni meta. Quitá esos valores o elegí el tipo numérico.',
  // 409: conflicto con el estado
  OBJECTIVE_CLOSED:
    'Este objetivo ya está cerrado y no se puede modificar. Si necesitás seguir trabajando, creá uno nuevo en un ciclo abierto.',
  OBJECTIVE_FIELD_LOCKED:
    'Después de publicar, el tipo y el origen del objetivo no se pueden cambiar. Podés editar el título, la descripción y la alineación.',
  OBJECTIVE_NOT_DRAFT:
    'Solo se pueden eliminar objetivos y resultados clave que siguen en borrador. Este ya fue publicado.',
  CYCLE_CLOSED:
    'El ciclo ya está cerrado, así que no se pueden hacer cambios. Trabajá en un ciclo activo.',
  // 422: reglas de negocio
  OBJECTIVE_LIMIT_EXCEEDED: `Ya hay ${OBJECTIVE_MAX} objetivos (entre borradores y publicados) para este responsable en el ciclo, que es el máximo. Eliminá un borrador o elegí otro ciclo.`,
  KR_LIMIT_EXCEEDED: `Un objetivo puede tener hasta ${KR_MAX} resultados clave. Eliminá uno en borrador para poder agregar otro.`,
  MIN_OBJECTIVES_NOT_MET: `Para publicar hacen falta al menos ${OBJECTIVE_MIN} objetivos del mismo responsable en este ciclo. Creá los que faltan y volvé a publicar.`,
  MIN_KRS_NOT_MET: `Para publicar, el objetivo necesita al menos ${KR_MIN} resultados clave. Agregá los que faltan y volvé a publicar.`,
  ALIGNMENT_PARENT_NOT_PUBLISHED:
    'Solo podés alinearte a un objetivo ya publicado. Elegí otro objetivo como padre o esperá a que se publique.',
};

export const OBJECTIVE_ERROR_COPY: ErrorCopy = {
  codes: OKR_CODE_COPY,
  statuses: {
    403: 'No tenés permiso para hacer esto con este objetivo. Solo puede modificarlo su responsable, el líder del equipo o administración.',
    404: 'No encontramos el objetivo (o el objetivo padre). Puede que ya no exista: volvé a la lista de objetivos.',
  },
};

export const KR_ERROR_COPY: ErrorCopy = {
  codes: OKR_CODE_COPY,
  statuses: {
    403: 'No tenés permiso para hacer este cambio. Después de publicar, solo el líder o administración pueden cambiar el inicio y la meta de un resultado clave.',
    404: 'No encontramos el resultado clave o el objetivo. Puede que ya no exista: recargá la página.',
  },
};

export const OBJECTIVE_TYPE_LABEL = {
  COMMITTED: 'Comprometido',
  ASPIRATIONAL: 'Aspiracional',
} as const;

export const OBJECTIVE_ORIGIN_LABEL = {
  TOP_DOWN: 'Top-down',
  BOTTOM_UP: 'Bottom-up',
} as const;

export const OBJECTIVE_STATUS_LABEL = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicado',
  CLOSED: 'Cerrado',
} as const;

export const KR_SCORING_LABEL = {
  DERIVED: 'Numérico',
  MANUAL: 'Manual (se cumple o no)',
} as const;

export const KR_TARGET_LOCKED_REASON =
  'Después de publicar, solo el líder o administración pueden cambiar el inicio y la meta.';
export const OBJECTIVE_KIND_LOCKED_REASON =
  'Después de publicar no se pueden cambiar el tipo ni el origen.';

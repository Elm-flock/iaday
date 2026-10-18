import type { ErrorCopy } from '@/lib/api/error-copy';
import type {
  AdaptationFormat,
  AdaptationRequest,
  AdaptationStatus,
} from '@/lib/dal/adaptation-requests';

// Fuera de actions.ts: un archivo 'use server' solo puede exportar funciones async.

export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 150;
export const DESCRIPTION_MAX = 2000;
/** Espejan los mínimos del dominio del back (`transitions.ts`). */
export const NOTE_MIN = 10;
export const REJECTION_MIN = 20;
export const TEXT_MAX = 2000;

export const FORMAT_LABEL: Record<AdaptationFormat, string> = {
  LECTURA_FACIL: 'Lectura fácil',
  LENGUAJE_CLARO: 'Lenguaje claro',
  AUDIO: 'Audio',
  APOYO_VISUAL: 'Con apoyo visual (imágenes o pictogramas)',
  REUNION_ADAPTADA: 'Reunión adaptada (explicación en persona)',
  OTRO: 'Otro formato (lo contás en el detalle)',
};

export const FORMATS = Object.keys(FORMAT_LABEL) as AdaptationFormat[];
export const isFormat = (value: unknown): value is AdaptationFormat =>
  typeof value === 'string' && value in FORMAT_LABEL;

export const STATUS_LABEL: Record<AdaptationStatus, string> = {
  PENDIENTE: 'Pendiente',
  EN_CURSO: 'En curso',
  ENTREGADA: 'Entregada',
  RECHAZADA: 'Rechazada',
};

export const STATUS_TONE: Record<AdaptationStatus, 'info' | 'success' | 'danger'> = {
  PENDIENTE: 'info',
  EN_CURSO: 'info',
  ENTREGADA: 'success',
  RECHAZADA: 'danger',
};

export const STATUS_HELP: Record<AdaptationStatus, string> = {
  PENDIENTE: 'Todavía nadie se hizo cargo. Lo vamos a responder antes de la fecha límite.',
  EN_CURSO: 'Una persona de administración ya se está ocupando.',
  ENTREGADA: 'Ya tenés tu documento. Mirá la nota de entrega.',
  RECHAZADA: 'No pudimos hacerlo. Abajo te explicamos por qué.',
};

export const LINKABLE = ['objective', 'check-in', 'feedback'] as const;
export type LinkableRoute = (typeof LINKABLE)[number];
export const isLinkableRoute = (value: unknown): value is LinkableRoute =>
  LINKABLE.includes(value as LinkableRoute);

/** Ruta de la UI -> tipo del back. */
export const ENTITY_BY_ROUTE: Record<LinkableRoute, 'OBJECTIVE' | 'CHECK_IN' | 'FEEDBACK'> = {
  objective: 'OBJECTIVE',
  'check-in': 'CHECK_IN',
  feedback: 'FEEDBACK',
};

export const ENTITY_LABEL: Record<NonNullable<AdaptationRequest['entityType']>, string> = {
  OBJECTIVE: 'un objetivo',
  CHECK_IN: 'un check-in',
  FEEDBACK: 'un feedback tuyo',
};

export const LEGAL_NOTE =
  'Tenés derecho a pedir un documento adaptado a una persona, no solo a la IA. Respondemos dentro del plazo. Si no podemos hacerlo, te lo explicamos por escrito y en un formato que puedas leer.';

export const REQUEST_ERROR_COPY: ErrorCopy = {
  statuses: {
    400: 'Hay datos que no son válidos. Revisá el formulario y probá de nuevo.',
    404: 'No encontramos el elemento que quisiste vincular. Puede que no exista o que no tengas acceso. Probá sin vincularlo.',
  },
};

export const ADMIN_ERROR_COPY: ErrorCopy = {
  codes: {
    ADAPTATION_REJECTION_JUSTIFICATION_REQUIRED: `Para rechazar hace falta una justificación por escrito, en lenguaje claro y de al menos ${REJECTION_MIN} caracteres.`,
    ADAPTATION_DELIVERY_NOTE_REQUIRED: `Contá qué entregás y cómo acceder a eso (al menos ${NOTE_MIN} caracteres).`,
    ADAPTATION_ASSIGNEE_INVALID: 'Solo se puede asignar a una persona de administración activa.',
    ADAPTATION_REQUEST_STATE_CONFLICT:
      'Este pedido ya fue resuelto o cambió mientras lo mirabas. Recargá la página.',
  },
  statuses: {
    404: 'No encontramos el pedido. Recargá la lista.',
  },
};

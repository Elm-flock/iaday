import type { ErrorCopy } from '@/lib/api/error-copy';

// Fuera de actions.ts: un archivo 'use server' solo puede exportar funciones async.

export const CONTENT_MAX = 2000;

export const PRIVACY_NOTICE = 'Solo vos y la otra persona pueden ver este feedback.';

export const FEEDBACK_GUIDE =
  'Contá qué viste, qué impacto tuvo y qué podría seguir o cambiar. El mejor feedback es específico, respetuoso y va en las dos direcciones: también pedí el tuyo.';

export const BOX_LABEL = { received: 'Recibido', sent: 'Enviado' } as const;

export const EMPTY_COPY = {
  received: {
    title: 'Todavía no recibiste feedback',
    description:
      'Cuando alguien te escriba, lo vas a ver acá. Si querés conocer su mirada, pedísela: el feedback funciona mejor cuando circula en las dos direcciones.',
  },
  sent: {
    title: 'Todavía no enviaste feedback',
    description:
      'Compartí algo concreto que viste en el trabajo de otra persona: lo que funcionó y lo que podría mejorar.',
  },
} as const;

export const FEEDBACK_ERROR_COPY: ErrorCopy = {
  codes: {
    FEEDBACK_SELF_SEND:
      'No podés enviarte feedback a vos mismo. Elegí a otra persona: el feedback funciona cuando circula entre compañeros.',
  },
  statuses: {
    400: `No pudimos enviar el feedback. Revisá que el mensaje tenga entre 1 y ${CONTENT_MAX} caracteres y que hayas elegido a una persona.`,
    403: 'Solo quien escribió el feedback puede editarlo o eliminarlo.',
    404: 'No encontramos a la persona o el feedback. Puede que ya no exista: volvé a la lista y probá de nuevo.',
  },
};

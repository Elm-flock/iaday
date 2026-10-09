import type { ErrorCopy } from '@/lib/api/error-copy';

// Fuera de actions.ts: un archivo 'use server' solo puede exportar funciones async.

export const MESSAGE_MAX = 2000;

export const RECOGNITION_ERROR_COPY: ErrorCopy = {
  codes: {
    RECOGNITION_SELF:
      'No podés reconocerte a vos mismo. Elegí a otra persona: el reconocimiento es una forma de destacar el trabajo de un compañero.',
    MILESTONE_NOT_REACHED:
      'Ese logro todavía no es un hito: el resultado clave necesita un puntaje de 0,70 o más, o el objetivo tiene que estar cerrado. Elegí otro logro de la lista.',
  },
  statuses: {
    400: `No pudimos enviar el reconocimiento. Revisá que el mensaje tenga entre 1 y ${MESSAGE_MAX} caracteres y que hayas elegido a una persona.`,
    404: 'No encontramos a la persona o al logro. Puede que ya no exista: volvé a elegir y probá de nuevo.',
  },
};

export const MILESTONE_RULE =
  'Se puede reconocer un resultado clave con puntaje de 0,70 o más, o un objetivo ya cerrado.';

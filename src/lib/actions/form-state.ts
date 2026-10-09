/** Estado común de los formularios con `useActionState` (tipos puros: usable desde 'use server' y clientes). */
export type FormState = {
  status: 'idle' | 'success' | 'error';
  /** Éxito: lo que se hizo. Error: qué pasó + cómo seguir. */
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Lo tipeado, para no perderlo ante un error (nunca contraseñas). */
  values?: Record<string, string>;
};

export const idleState: FormState = { status: 'idle' };

export function errorState(
  message: string,
  extra: Pick<FormState, 'fieldErrors' | 'values'> = {},
): FormState {
  return { status: 'error', message, ...extra };
}

export function successState(message: string): FormState {
  return { status: 'success', message };
}

/** Valores de texto del FormData sin contraseñas, para devolver ante un error. */
export function textValues(formData: FormData, omit: string[] = []): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string' && !omit.includes(key) && !key.startsWith('$ACTION')) {
      values[key] = value;
    }
  }
  return values;
}

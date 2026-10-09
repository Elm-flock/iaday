'use client';

import { startTransition, useActionState, type FormEvent } from 'react';
import { idleState, type FormState } from './form-state';

/**
 * `useActionState` para formularios que NO deben resetearse tras la action.
 *
 * Con `<form action={formAction}>` React 19 hace `form.reset()` al terminar la action: los inputs
 * vuelven a su `defaultValue` original y los `<select>` a su opción inicial (React no actualiza
 * `defaultSelected` en un select), así que un error del servidor deshacía lo que la persona
 * eligió. Acá se despacha la action a mano desde `onSubmit`: el formulario conserva lo ingresado.
 */
export function useActionForm(action: (prev: FormState, formData: FormData) => Promise<FormState>) {
  const [state, formAction, pending] = useActionState(action, idleState);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return { state, onSubmit, pending };
}

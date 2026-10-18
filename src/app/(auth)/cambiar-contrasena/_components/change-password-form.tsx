'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { TextInput } from '@/components/ui/text-input';
import { idleState } from '@/lib/actions/form-state';
import { changePasswordAction } from '../../actions';
import { NEW_PASSWORD_MIN } from '../../password-form-data';

/**
 * `<form action>` (no `onSubmit`): si se envía antes de hidratar, el navegador igual despacha la Server
 * Action por POST. Con `onSubmit` + `preventDefault`, un envío temprano sería un GET nativo con las
 * contraseñas en la URL. Tras un error React limpia los campos: para contraseñas es lo deseable.
 */
export function ChangePasswordForm({ next, forced }: { next: string; forced: boolean }) {
  const [state, formAction, pending] = useActionState(changePasswordAction, idleState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-s20" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.status === 'error' && state.message ? (
        <Alert tone="danger">{state.message}</Alert>
      ) : null}
      <FormField
        label={forced ? 'Contraseña inicial' : 'Contraseña actual'}
        required
        error={errors.currentPassword}
        help={forced ? 'La que te dio administración.' : undefined}
      >
        <TextInput name="currentPassword" type="password" autoComplete="current-password" />
      </FormField>
      <FormField
        label="Contraseña nueva"
        required
        error={errors.newPassword}
        help={`Al menos ${NEW_PASSWORD_MIN} caracteres. Una frase larga es más segura y fácil de recordar.`}
      >
        <TextInput name="newPassword" type="password" autoComplete="new-password" />
      </FormField>
      <FormField label="Repetí la contraseña nueva" required error={errors.confirmPassword}>
        <TextInput name="confirmPassword" type="password" autoComplete="new-password" />
      </FormField>
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Cambiar contraseña
      </Button>
    </form>
  );
}

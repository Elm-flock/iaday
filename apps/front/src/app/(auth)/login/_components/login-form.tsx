'use client';

import { useActionState } from 'react';
import { loginAction, type LoginState } from '../../actions';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { TextInput } from '@/components/ui/text-input';

const initialState: LoginState = {};

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-s20" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <FormField label="Email" required>
        <TextInput
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={state.email}
          placeholder="nombre@flockit.com.ar"
        />
      </FormField>
      <FormField label="Contraseña" required>
        <TextInput name="password" type="password" autoComplete="current-password" />
      </FormField>
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Ingresar
      </Button>
    </form>
  );
}

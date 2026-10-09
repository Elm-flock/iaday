'use client';

import { KeyRound, Pencil, Plus } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { createUserAction, resetPasswordAction, updateUserAction } from '../actions';
import { ROLE_LABEL } from '../messages';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { TextInput } from '@/components/ui/text-input';
import { useToast } from '@/components/ui/toast';
import type { FormState } from '@/lib/actions/form-state';
import { useActionForm } from '@/lib/actions/use-action-form';
import type { components } from '@/lib/api/schema';

type User = components['schemas']['UserDto'];

const RoleOptions = () =>
  Object.entries(ROLE_LABEL).map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));

/** Efecto común: al terminar bien, toast + cerrar. */
function useCloseOnSuccess(state: FormState, onClose: () => void) {
  const toast = useToast();
  useEffect(() => {
    if (state.status === 'success') {
      toast.show(state.message ?? 'Listo.');
      onClose();
    }
  }, [state, toast, onClose]);
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const { state, onSubmit, pending } = useActionForm(createUserAction);
  const formId = useId();
  const values = state.values ?? {};
  const errors = state.fieldErrors ?? {};
  useCloseOnSuccess(state, onClose);

  return (
    <Modal
      open
      onClose={onClose}
      title="Crear usuario"
      description="La persona va a ingresar con este email y la contraseña inicial que definas."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} loading={pending}>
            Crear usuario
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-s15" noValidate>
        {state.status === 'error' && state.message ? (
          <Alert tone="danger">{state.message}</Alert>
        ) : null}
        <FormField label="Nombre" required error={errors.name}>
          <TextInput name="name" defaultValue={values.name ?? ''} autoComplete="off" />
        </FormField>
        <FormField label="Email" required error={errors.email}>
          <TextInput
            name="email"
            type="email"
            defaultValue={values.email ?? ''}
            autoComplete="off"
            placeholder="nombre@flockit.com.ar"
          />
        </FormField>
        <FormField label="Rol" required error={errors.role}>
          <Select name="role" defaultValue={values.role ?? 'MEMBER'}>
            <RoleOptions />
          </Select>
        </FormField>
        <FormField
          label="Contraseña inicial"
          required
          error={errors.password}
          help="Entre 8 y 200 caracteres."
        >
          <TextInput name="password" type="password" autoComplete="new-password" />
        </FormField>
      </form>
    </Modal>
  );
}

function EditUserModal({
  user,
  isSelf,
  onClose,
}: {
  user: User;
  isSelf: boolean;
  onClose: () => void;
}) {
  const { state, onSubmit, pending } = useActionForm(updateUserAction.bind(null, user.id, isSelf));
  const formId = useId();
  const values = state.values ?? {};
  const errors = state.fieldErrors ?? {};
  useCloseOnSuccess(state, onClose);

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar usuario"
      description={user.email}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} loading={pending}>
            Guardar cambios
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-s15" noValidate>
        {state.status === 'error' && state.message ? (
          <Alert tone="danger">{state.message}</Alert>
        ) : null}
        <FormField label="Nombre" required error={errors.name}>
          <TextInput name="name" defaultValue={values.name ?? user.name} />
        </FormField>
        <FormField
          label="Rol"
          required
          error={errors.role}
          help={
            isSelf
              ? 'No podés cambiar tu propio rol. Pedíselo a otra persona de administración.'
              : undefined
          }
        >
          <Select name="role" defaultValue={values.role ?? user.role} disabled={isSelf}>
            <RoleOptions />
          </Select>
        </FormField>
        <div className="flex flex-col gap-s5">
          <Switch
            name="active"
            label="Usuario activo"
            defaultChecked={user.active}
            disabled={isSelf}
          />
          <p className="text-body-sm text-ink-muted">
            {isSelf
              ? 'No podés desactivarte a vos mismo.'
              : 'Si lo desactivás, la persona pierde el acceso de inmediato.'}
          </p>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { state, onSubmit, pending } = useActionForm(resetPasswordAction.bind(null, user.id));
  const formId = useId();
  useCloseOnSuccess(state, onClose);

  return (
    <Modal
      open
      onClose={onClose}
      title="Restablecer contraseña"
      description={`Definí una contraseña nueva para ${user.name}. La anterior deja de funcionar.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} loading={pending}>
            Cambiar contraseña
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-s15" noValidate>
        {state.status === 'error' && state.message ? (
          <Alert tone="danger">{state.message}</Alert>
        ) : null}
        <FormField
          label="Contraseña nueva"
          required
          error={state.fieldErrors?.password}
          help="Entre 8 y 200 caracteres."
        >
          <TextInput name="password" type="password" autoComplete="new-password" />
        </FormField>
      </form>
    </Modal>
  );
}

export function CreateUserButton() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button
        icon={<Plus size={18} strokeWidth={1.75} aria-hidden="true" />}
        onClick={() => setOpen(true)}
      >
        Crear usuario
      </Button>
      {open ? <CreateUserModal onClose={close} /> : null}
    </>
  );
}

/** Acciones por fila: editar (nombre, rol, estado) y restablecer contraseña. */
export function UserRowActions({ user, isSelf }: { user: User; isSelf: boolean }) {
  const [modal, setModal] = useState<'edit' | 'password' | null>(null);
  const close = useCallback(() => setModal(null), []);
  return (
    <div className="flex items-center justify-end gap-s5">
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Editar a ${user.name}`}
        icon={<Pencil size={16} strokeWidth={1.75} aria-hidden="true" />}
        onClick={() => setModal('edit')}
      >
        Editar
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Restablecer la contraseña de ${user.name}`}
        icon={<KeyRound size={16} strokeWidth={1.75} aria-hidden="true" />}
        onClick={() => setModal('password')}
      >
        Contraseña
      </Button>
      {modal === 'edit' ? <EditUserModal user={user} isSelf={isSelf} onClose={close} /> : null}
      {modal === 'password' ? <ResetPasswordModal user={user} onClose={close} /> : null}
    </div>
  );
}

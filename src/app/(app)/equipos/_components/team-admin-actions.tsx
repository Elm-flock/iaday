'use client';

import { Pencil, Plus } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { createTeamAction, updateTeamAction } from '../actions';
import type { FlatTeam } from '../team-tree';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { TextInput } from '@/components/ui/text-input';
import { useToast } from '@/components/ui/toast';
import { useActionForm } from '@/lib/actions/use-action-form';

type TeamFormModalProps = { onClose: () => void } & (
  | { mode: 'create'; parents: FlatTeam[]; defaultParentId?: string }
  | {
      mode: 'edit';
      team: { id: string; name: string; parentId: string | null };
      parents: FlatTeam[];
    }
);

const indent = (depth: number) => `${'  '.repeat(depth)}${depth > 0 ? '↳ ' : ''}`;

function TeamFormModal(props: TeamFormModalProps) {
  const { onClose } = props;
  const editing = props.mode === 'edit' ? props.team : null;
  const action = editing ? updateTeamAction.bind(null, editing.id) : createTeamAction;
  const { state, onSubmit, pending } = useActionForm(action);
  const toast = useToast();
  const formId = useId();
  const values = state.values ?? {};
  const errors = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.status === 'success') {
      toast.show(state.message ?? 'Listo.');
      onClose();
    }
  }, [state, toast, onClose]);

  // El equipo raíz (la organización) no tiene padre; los demás eligen uno.
  const showParent = props.mode === 'create' || editing?.parentId !== null;
  const defaultParent =
    values.parentId ?? (props.mode === 'create' ? props.defaultParentId : editing?.parentId) ?? '';

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Editar equipo' : 'Crear equipo'}
      description="Los equipos forman un árbol: cada equipo pertenece a otro equipo."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} loading={pending}>
            {editing ? 'Guardar cambios' : 'Crear equipo'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-s15" noValidate>
        {state.status === 'error' && state.message ? (
          <Alert tone="danger">{state.message}</Alert>
        ) : null}
        <FormField label="Nombre" required error={errors.name}>
          <TextInput
            name="name"
            defaultValue={values.name ?? editing?.name ?? ''}
            maxLength={120}
          />
        </FormField>
        {showParent ? (
          <FormField label="Equipo padre" required error={errors.parentId}>
            <Select name="parentId" defaultValue={defaultParent}>
              <option value="" disabled>
                Elegí un equipo
              </option>
              {props.parents.map((t) => (
                <option key={t.id} value={t.id}>
                  {indent(t.depth)}
                  {t.name}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}
      </form>
    </Modal>
  );
}

export function CreateTeamButton({
  parents,
  defaultParentId,
}: {
  parents: FlatTeam[];
  defaultParentId?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button
        icon={<Plus size={18} strokeWidth={1.75} aria-hidden="true" />}
        onClick={() => setOpen(true)}
      >
        Crear equipo
      </Button>
      {open ? (
        <TeamFormModal
          mode="create"
          parents={parents}
          defaultParentId={defaultParentId}
          onClose={close}
        />
      ) : null}
    </>
  );
}

export function EditTeamButton({
  team,
  parents,
}: {
  team: { id: string; name: string; parentId: string | null };
  /** Candidatos a padre: sin el propio equipo ni sus descendientes. */
  parents: FlatTeam[];
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button
        variant="secondary"
        icon={<Pencil size={18} strokeWidth={1.75} aria-hidden="true" />}
        onClick={() => setOpen(true)}
      >
        Editar equipo
      </Button>
      {open ? <TeamFormModal mode="edit" team={team} parents={parents} onClose={close} /> : null}
    </>
  );
}

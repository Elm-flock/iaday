'use client';

import { Pencil, Send, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useId, useState, useTransition } from 'react';
import { deleteObjectiveAction, publishObjectiveAction, updateObjectiveAction } from '../actions';
import { KR_MIN, OBJECTIVE_MAX, OBJECTIVE_MIN } from '../messages';
import { ObjectiveFields, type ParentOption } from './objective-fields';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import type { FormState } from '@/lib/actions/form-state';
import { useActionForm } from '@/lib/actions/use-action-form';
import type { Objective } from '@/lib/dal/objectives';

type EditableObjective = Pick<
  Objective,
  'id' | 'title' | 'description' | 'type' | 'origin' | 'status' | 'parentObjectiveId'
>;

function EditObjectiveModal({
  objective,
  parents,
  onClose,
}: {
  objective: EditableObjective;
  parents: ParentOption[];
  onClose: () => void;
}) {
  const kindEditable = objective.status === 'DRAFT';
  const { state, onSubmit, pending } = useActionForm(
    updateObjectiveAction.bind(null, objective.id, kindEditable),
  );
  const toast = useToast();
  const formId = useId();

  useEffect(() => {
    if (state.status === 'success') {
      toast.show(state.message ?? 'Listo.');
      onClose();
    }
  }, [state, toast, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar objetivo"
      description={
        kindEditable
          ? 'Mientras esté en borrador podés cambiar todo.'
          : 'Ya está publicado: podés editar el título, la descripción y la alineación.'
      }
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
        <ObjectiveFields
          values={state.values ?? {}}
          errors={state.fieldErrors ?? {}}
          defaults={{
            title: objective.title,
            description: objective.description ?? '',
            type: objective.type,
            origin: objective.origin,
            parent: objective.parentObjectiveId ?? '',
          }}
          parents={parents}
          kindLocked={!kindEditable}
        />
      </form>
    </Modal>
  );
}

type Confirm = 'publish' | 'delete' | null;

/**
 * Acciones del objetivo para quien puede editarlo: editar, eliminar (solo borrador) y publicar.
 * Publicar es la acción primaria del borrador; la regla ≥3/≥3 se explica en la confirmación y el back la valida.
 */
export function ObjectiveActions({
  objective,
  parents,
  keyResultCount,
}: {
  objective: EditableObjective;
  parents: ParentOption[];
  keyResultCount: number;
}) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const closeEdit = useCallback(() => setEditing(false), []);
  const isDraft = objective.status === 'DRAFT';

  function run(action: (id: string) => Promise<FormState>) {
    startTransition(async () => {
      const result = await action(objective.id);
      setConfirm(null);
      if (result.status === 'success') {
        setError(null);
        toast.show(result.message ?? 'Listo.');
      } else {
        setError(result.message ?? 'No pudimos completar la acción. Probá de nuevo.');
      }
    });
  }

  if (objective.status === 'CLOSED') return null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-s10">
        <Button
          variant="secondary"
          icon={<Pencil size={18} strokeWidth={1.75} aria-hidden="true" />}
          onClick={() => setEditing(true)}
        >
          Editar
        </Button>
        {isDraft ? (
          <>
            <Button
              variant="secondary"
              icon={<Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />}
              onClick={() => setConfirm('delete')}
            >
              Eliminar
            </Button>
            <Button
              icon={<Send size={18} strokeWidth={1.75} aria-hidden="true" />}
              onClick={() => setConfirm('publish')}
            >
              Publicar
            </Button>
          </>
        ) : null}
      </div>
      {!isDraft ? (
        <p className="mt-s5 text-right text-caption text-ink-muted">
          Ya está publicado: no se puede eliminar.
        </p>
      ) : null}

      {error ? (
        <Alert tone="danger" className="mt-s15">
          {error}
        </Alert>
      ) : null}

      {editing ? (
        <EditObjectiveModal objective={objective} parents={parents} onClose={closeEdit} />
      ) : null}

      <ConfirmDialog
        open={confirm === 'publish'}
        title="Publicar objetivo"
        description={`Para publicar hacen falta al menos ${OBJECTIVE_MIN} objetivos del mismo responsable en el ciclo (hasta ${OBJECTIVE_MAX}) y al menos ${KR_MIN} resultados clave en este. Este objetivo tiene ${keyResultCount}. Al publicarlo lo ve todo el equipo y ya no se puede eliminar ni cambiar su tipo, origen, inicio y meta sin permiso del líder.`}
        confirmLabel="Publicar objetivo"
        tone="primary"
        loading={pending}
        onConfirm={() => run(publishObjectiveAction)}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="Eliminar objetivo"
        description={`Vas a eliminar "${objective.title}" y sus resultados clave. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar objetivo"
        loading={pending}
        onConfirm={() => run(deleteObjectiveAction)}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

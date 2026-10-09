'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useId, useState, useTransition } from 'react';
import { deleteFeedbackAction, updateFeedbackAction } from '../actions';
import { CONTENT_MAX } from '../messages';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormField } from '@/components/ui/form-field';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useActionForm } from '@/lib/actions/use-action-form';

function EditFeedbackModal({
  id,
  content,
  onClose,
}: {
  id: string;
  content: string;
  onClose: () => void;
}) {
  const { state, onSubmit, pending } = useActionForm(updateFeedbackAction.bind(null, id));
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
      title="Editar feedback"
      description="La otra persona va a ver los cambios. Solo ustedes dos tienen acceso a este feedback."
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
        <FormField label="Mensaje" required error={state.fieldErrors?.content}>
          <Textarea
            name="content"
            rows={6}
            maxLength={CONTENT_MAX}
            defaultValue={state.values?.content ?? content}
          />
        </FormField>
      </form>
    </Modal>
  );
}

/** Editar y eliminar: solo el autor (el back lo confirma con 403 si alguien fuerza la acción). */
export function FeedbackAuthorActions({ id, content }: { id: string; content: string }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const closeEdit = useCallback(() => setEditing(false), []);

  function remove() {
    startTransition(async () => {
      // En éxito la action redirige a la lista; solo vuelve acá si falló.
      const result = await deleteFeedbackAction(id);
      setConfirming(false);
      if (result.status === 'error') {
        setError(result.message ?? 'No pudimos eliminar el feedback. Probá de nuevo.');
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-s10">
        <Button
          variant="secondary"
          icon={<Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />}
          onClick={() => setConfirming(true)}
        >
          Eliminar
        </Button>
        <Button
          variant="secondary"
          icon={<Pencil size={18} strokeWidth={1.75} aria-hidden="true" />}
          onClick={() => setEditing(true)}
        >
          Editar
        </Button>
      </div>
      {error ? (
        <Alert tone="danger" className="mt-s15">
          {error}
        </Alert>
      ) : null}
      {editing ? <EditFeedbackModal id={id} content={content} onClose={closeEdit} /> : null}
      <ConfirmDialog
        open={confirming}
        title="Eliminar feedback"
        description="Vas a eliminar este feedback y la otra persona dejará de verlo. Esta acción no se puede deshacer."
        confirmLabel="Eliminar feedback"
        loading={pending}
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

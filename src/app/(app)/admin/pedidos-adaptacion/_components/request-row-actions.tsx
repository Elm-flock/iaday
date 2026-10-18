'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { assignRequestAction, deliverRequestAction, rejectRequestAction } from '../actions';
import { NOTE_MIN, REJECTION_MIN, TEXT_MAX } from '../../../pedidos-adaptacion/messages';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TextInput } from '@/components/ui/text-input';
import { useToast } from '@/components/ui/toast';
import type { FormState } from '@/lib/actions/form-state';
import { useActionForm } from '@/lib/actions/use-action-form';
import type { AdaptationRequest } from '@/lib/dal/adaptation-requests';

export type AdminOption = { id: string; name: string };

/** Al terminar bien: aviso + cerrar la ventana. */
function useCloseOnSuccess(state: FormState, onClose: () => void) {
  const toast = useToast();
  useEffect(() => {
    if (state.status === 'success') {
      toast.show(state.message ?? 'Listo.');
      onClose();
    }
  }, [state, toast, onClose]);
}

function Footer({
  formId,
  pending,
  submit,
  onClose,
  danger = false,
}: {
  formId: string;
  pending: boolean;
  submit: string;
  onClose: () => void;
  danger?: boolean;
}) {
  return (
    <>
      <Button variant="secondary" onClick={onClose}>
        Cancelar
      </Button>
      <Button type="submit" form={formId} loading={pending} variant={danger ? 'danger' : 'primary'}>
        {submit}
      </Button>
    </>
  );
}

function AssignModal({
  request,
  admins,
  currentUserId,
  onClose,
}: {
  request: AdaptationRequest;
  admins: AdminOption[];
  currentUserId: string;
  onClose: () => void;
}) {
  const { state, onSubmit, pending } = useActionForm(assignRequestAction.bind(null, request.id));
  const formId = useId();
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};
  useCloseOnSuccess(state, onClose);

  return (
    <Modal
      open
      onClose={onClose}
      title="Asignar pedido"
      description="La persona elegida se hace cargo y el pedido pasa a En curso."
      footer={<Footer formId={formId} pending={pending} submit="Asignar" onClose={onClose} />}
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-s15" noValidate>
        {state.status === 'error' && state.message ? (
          <Alert tone="danger">{state.message}</Alert>
        ) : null}
        <FormField label="Quién se hace cargo" required error={errors.assigneeId}>
          <Select
            name="assigneeId"
            defaultValue={values.assigneeId ?? request.assigneeId ?? currentUserId}
          >
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.id === currentUserId ? `${a.name} (vos)` : a.name}
              </option>
            ))}
          </Select>
        </FormField>
      </form>
    </Modal>
  );
}

function DeliverModal({ request, onClose }: { request: AdaptationRequest; onClose: () => void }) {
  const { state, onSubmit, pending } = useActionForm(deliverRequestAction.bind(null, request.id));
  const formId = useId();
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};
  useCloseOnSuccess(state, onClose);

  return (
    <Modal
      open
      onClose={onClose}
      title="Entregar el documento"
      description="La persona va a ver esta nota en su pedido."
      footer={
        <Footer
          formId={formId}
          pending={pending}
          submit="Marcar como entregado"
          onClose={onClose}
        />
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-s15" noValidate>
        {state.status === 'error' && state.message ? (
          <Alert tone="danger">{state.message}</Alert>
        ) : null}
        <FormField
          label="Nota de entrega"
          required
          error={errors.resolutionNote}
          help={`Qué entregás y cómo acceder. Al menos ${NOTE_MIN} caracteres.`}
        >
          <Textarea
            name="resolutionNote"
            rows={4}
            maxLength={TEXT_MAX}
            defaultValue={values.resolutionNote ?? ''}
          />
        </FormField>
        <FormField
          label="Enlace al documento"
          error={errors.resolutionLink}
          help="Opcional. Un enlace completo que empiece con https://."
        >
          <TextInput
            name="resolutionLink"
            type="url"
            inputMode="url"
            defaultValue={values.resolutionLink ?? ''}
          />
        </FormField>
      </form>
    </Modal>
  );
}

function RejectModal({ request, onClose }: { request: AdaptationRequest; onClose: () => void }) {
  const { state, onSubmit, pending } = useActionForm(rejectRequestAction.bind(null, request.id));
  const formId = useId();
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};
  useCloseOnSuccess(state, onClose);

  return (
    <Modal
      open
      onClose={onClose}
      title="Rechazar el pedido"
      description="Solo corresponde rechazar si adaptar el documento supone una carga desproporcionada."
      footer={
        <Footer
          formId={formId}
          pending={pending}
          submit="Rechazar pedido"
          onClose={onClose}
          danger
        />
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-s15" noValidate>
        {state.status === 'error' && state.message ? (
          <Alert tone="danger">{state.message}</Alert>
        ) : null}
        <FormField
          label="Justificación"
          required
          error={errors.justification}
          help={`Explicá el motivo por escrito, en lenguaje claro: la persona lo va a leer. Al menos ${REJECTION_MIN} caracteres.`}
        >
          <Textarea
            name="justification"
            rows={5}
            maxLength={TEXT_MAX}
            defaultValue={values.justification ?? ''}
          />
        </FormField>
      </form>
    </Modal>
  );
}

type Dialog = 'assign' | 'deliver' | 'reject' | null;

/** Acciones de una fila abierta: asignar, entregar o rechazar (cada una en su ventana). */
export function RequestRowActions({
  request,
  admins,
  currentUserId,
}: {
  request: AdaptationRequest;
  admins: AdminOption[];
  currentUserId: string;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = useCallback(() => setDialog(null), []);

  return (
    <>
      <div className="flex flex-wrap justify-end gap-s10">
        <Button size="sm" variant="secondary" onClick={() => setDialog('assign')}>
          {request.assigneeId ? 'Reasignar' : 'Asignar'}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setDialog('deliver')}>
          Entregar
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setDialog('reject')}>
          Rechazar
        </Button>
      </div>
      {dialog === 'assign' ? (
        <AssignModal
          request={request}
          admins={admins}
          currentUserId={currentUserId}
          onClose={close}
        />
      ) : null}
      {dialog === 'deliver' ? <DeliverModal request={request} onClose={close} /> : null}
      {dialog === 'reject' ? <RejectModal request={request} onClose={close} /> : null}
    </>
  );
}

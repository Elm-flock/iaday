'use client';

import { Crown, UserMinus, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useId, useState, useTransition } from 'react';
import { addMemberAction, removeMemberAction, setLeadAction } from '../actions';
import { Alert } from '@/components/ui/alert';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toast';
import type { FormState } from '@/lib/actions/form-state';
import { useActionForm } from '@/lib/actions/use-action-form';

export type Member = { userId: string; name: string; isLead: boolean };
export type Candidate = { id: string; name: string };

function LeadTag() {
  return (
    <Tag className="gap-s5">
      <Crown size={14} strokeWidth={1.75} aria-hidden="true" />
      Líder
    </Tag>
  );
}

function AddMemberModal({
  teamId,
  candidates,
  onClose,
}: {
  teamId: string;
  candidates: Candidate[];
  onClose: () => void;
}) {
  const { state, onSubmit, pending } = useActionForm(addMemberAction.bind(null, teamId));
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
      title="Agregar integrante"
      description="Elegí a la persona y, si corresponde, marcala como líder del equipo."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} loading={pending}>
            Agregar al equipo
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-s15" noValidate>
        {state.status === 'error' && state.message ? (
          <Alert tone="danger">{state.message}</Alert>
        ) : null}
        <FormField label="Persona" required error={state.fieldErrors?.userId}>
          <Select name="userId" defaultValue="">
            <option value="" disabled>
              Elegí una persona
            </option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>
        <Switch name="isLead" label="Es líder del equipo" />
      </form>
    </Modal>
  );
}

/** Integrantes del equipo. Con `canManage`, permite agregar, marcar liderazgo y quitar. */
export function MembersManager({
  teamId,
  members,
  candidates,
  canManage,
}: {
  teamId: string;
  members: Member[];
  candidates: Candidate[];
  canManage: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const closeAdd = useCallback(() => setAdding(false), []);

  function run(action: () => Promise<FormState>) {
    startTransition(async () => {
      const result = await action();
      setRemoving(null);
      if (result.status === 'success') {
        setError(null);
        toast.show(result.message ?? 'Listo.');
      } else {
        setError(result.message ?? 'No pudimos completar la acción. Probá de nuevo.');
      }
    });
  }

  const addButton = canManage ? (
    <Button
      variant="secondary"
      disabled={candidates.length === 0}
      icon={<UserPlus size={18} strokeWidth={1.75} aria-hidden="true" />}
      onClick={() => setAdding(true)}
    >
      Agregar integrante
    </Button>
  ) : null;

  return (
    <Card title="Integrantes" actions={addButton}>
      {canManage && candidates.length === 0 ? (
        <p className="mb-s15 text-body-sm text-ink-muted">
          Todas las personas activas ya están en este equipo.
        </p>
      ) : null}
      {error ? (
        <Alert tone="danger" className="mb-s15">
          {error}
        </Alert>
      ) : null}
      {members.length === 0 ? (
        <EmptyState
          title="Este equipo todavía no tiene integrantes"
          description={
            canManage
              ? 'Agregá a la primera persona con "Agregar integrante".'
              : 'Cuando administración sume personas, las vas a ver acá.'
          }
        />
      ) : (
        <ul>
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex flex-wrap items-center justify-between gap-s10 border-t border-border py-s10 first:border-t-0 first:pt-0"
            >
              <div className="flex items-center gap-s10">
                <Avatar name={m.name} />
                <span className="text-body text-ink">{m.name}</span>
                {m.isLead ? <LeadTag /> : null}
              </div>
              {canManage ? (
                <div className="flex items-center gap-s10">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => setLeadAction(teamId, m.userId, !m.isLead))}
                  >
                    {m.isLead ? 'Quitar liderazgo' : 'Hacer líder'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    aria-label={`Quitar a ${m.name} del equipo`}
                    icon={<UserMinus size={16} strokeWidth={1.75} aria-hidden="true" />}
                    onClick={() => setRemoving(m)}
                  >
                    Quitar
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <AddMemberModal teamId={teamId} candidates={candidates} onClose={closeAdd} />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title="Quitar del equipo"
        description={
          removing
            ? `${removing.name} deja de ser parte de este equipo. Podés volver a agregarla cuando quieras.`
            : ''
        }
        confirmLabel={removing ? `Quitar a ${removing.name}` : 'Quitar'}
        loading={pending}
        onConfirm={() => removing && run(() => removeMemberAction(teamId, removing.userId))}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  );
}

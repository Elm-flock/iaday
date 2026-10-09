'use client';

import { Pencil, Play, Plus, Lock } from 'lucide-react';
import { useCallback, useState, useTransition } from 'react';
import { activateCycleAction, closeCycleAction } from '../actions';
import { CycleFormModal } from './cycle-form-modal';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import type { FormState } from '@/lib/actions/form-state';
import type { components } from '@/lib/api/schema';

type Cycle = components['schemas']['CycleDto'];

/** Botón + modal para crear un ciclo (anual o trimestral). */
export function CreateCycleButton({
  annuals,
  defaultParentId,
  label = 'Crear ciclo',
  variant = 'primary',
}: {
  annuals: Cycle[];
  defaultParentId?: string;
  label?: string;
  variant?: 'primary' | 'secondary';
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button
        variant={variant}
        icon={<Plus size={18} strokeWidth={1.75} aria-hidden="true" />}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      {open ? (
        <CycleFormModal
          mode="create"
          annuals={annuals}
          defaultParentId={defaultParentId}
          onClose={close}
        />
      ) : null}
    </>
  );
}

type Pending = 'activate' | 'close' | null;

/** Acciones de administración sobre un ciclo: editar, activar y cerrar (con confirmación). */
export function CycleAdminActions({ cycle }: { cycle: Cycle }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const closeEdit = useCallback(() => setEditing(false), []);

  function run(action: (id: string) => Promise<FormState>) {
    startTransition(async () => {
      const result = await action(cycle.id);
      setConfirm(null);
      if (result.status === 'success') {
        setError(null);
        toast.show(result.message ?? 'Listo.');
      } else {
        setError(result.message ?? 'No pudimos completar la acción. Probá de nuevo.');
      }
    });
  }

  if (cycle.status === 'CLOSED') return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-s10">
        <Button
          variant="secondary"
          icon={<Pencil size={18} strokeWidth={1.75} aria-hidden="true" />}
          onClick={() => setEditing(true)}
        >
          Editar
        </Button>
        {cycle.status === 'ACTIVE' ? (
          <Button
            variant="danger"
            icon={<Lock size={18} strokeWidth={1.75} aria-hidden="true" />}
            onClick={() => setConfirm('close')}
          >
            Cerrar ciclo
          </Button>
        ) : (
          <Button
            icon={<Play size={18} strokeWidth={1.75} aria-hidden="true" />}
            onClick={() => setConfirm('activate')}
          >
            Activar ciclo
          </Button>
        )}
      </div>

      {error ? (
        <Alert tone="danger" className="mt-s15">
          {error}
        </Alert>
      ) : null}

      {editing ? <CycleFormModal mode="edit" cycle={cycle} onClose={closeEdit} /> : null}

      <ConfirmDialog
        open={confirm === 'activate'}
        title="Activar ciclo"
        description={`Al activar "${cycle.name}" empieza a regir su cadencia de check-ins. Las fechas dejan de poder editarse.`}
        confirmLabel="Activar ciclo"
        tone="primary"
        loading={pending}
        onConfirm={() => run(activateCycleAction)}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'close'}
        title="Cerrar ciclo"
        description={`Al cerrar "${cycle.name}" se calcula el puntaje final de sus objetivos publicados y ya no se puede editar ni reabrir. Esta acción no se puede deshacer.`}
        confirmLabel="Cerrar ciclo"
        tone="danger"
        loading={pending}
        onConfirm={() => run(closeCycleAction)}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

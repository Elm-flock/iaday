'use client';

import { useEffect, useId, useState } from 'react';
import { createCycleAction, updateCycleAction } from '../actions';
import { CADENCE_LABEL, CYCLE_KIND_LABEL } from '../messages';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { TextInput } from '@/components/ui/text-input';
import { useToast } from '@/components/ui/toast';
import { useActionForm } from '@/lib/actions/use-action-form';
import type { components } from '@/lib/api/schema';
import { formatDate, formatScore } from '@/lib/format';

type Cycle = components['schemas']['CycleDto'];

type CycleFormModalProps = { onClose: () => void } & (
  { mode: 'create'; annuals: Cycle[]; defaultParentId?: string } | { mode: 'edit'; cycle: Cycle }
);

const THRESHOLD_HELP = 'Entre 0 y 1, por ejemplo 0,70.';

/** Modal de alta/edición de ciclo. Se monta solo mientras está abierto (el estado del form se descarta al cerrar). */
export function CycleFormModal(props: CycleFormModalProps) {
  const { onClose } = props;
  const editing = props.mode === 'edit' ? props.cycle : null;
  const datesEditable = editing ? editing.status === 'DRAFT' : true;

  const action = editing
    ? updateCycleAction.bind(null, editing.id, datesEditable)
    : createCycleAction;
  const { state, onSubmit, pending } = useActionForm(action);
  const toast = useToast();
  const formId = useId();

  const values = state.values ?? {};
  const errors = state.fieldErrors ?? {};
  const initialKind = props.mode === 'create' && props.defaultParentId ? 'QUARTER' : 'ANNUAL';
  // El select es NO controlado (defaultValue): React 19 resetea el form tras cada action y un select
  // controlado quedaría desincronizado del estado (enviaría ANNUAL mostrando los campos de trimestre).
  const [kind, setKind] = useState<'ANNUAL' | 'QUARTER'>(initialKind);

  useEffect(() => {
    if (state.status === 'success') {
      toast.show(state.message ?? 'Listo.');
      onClose();
    }
  }, [state, toast, onClose]);

  const annuals = props.mode === 'create' ? props.annuals : [];
  const dateHelp = datesEditable
    ? undefined
    : 'Las fechas solo se pueden cambiar mientras el ciclo está en borrador.';

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Editar ciclo' : 'Crear ciclo'}
      description={
        editing
          ? 'Podés cambiar el nombre, la cadencia y los umbrales mientras el ciclo no esté cerrado.'
          : 'Un ciclo anual agrupa trimestres. Los trimestres no pueden superponerse.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} loading={pending}>
            {editing ? 'Guardar cambios' : 'Crear ciclo'}
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
            placeholder="OKR 2026"
            maxLength={120}
          />
        </FormField>

        {editing ? null : (
          <FormField label="Tipo" required error={errors.kind}>
            <Select
              name="kind"
              defaultValue={values.kind ?? initialKind}
              onChange={(e) => setKind(e.target.value as 'ANNUAL' | 'QUARTER')}
            >
              <option value="ANNUAL">{CYCLE_KIND_LABEL.ANNUAL}</option>
              <option value="QUARTER">{CYCLE_KIND_LABEL.QUARTER}</option>
            </Select>
          </FormField>
        )}

        {!editing && kind === 'QUARTER' ? (
          <FormField label="Ciclo anual" required error={errors.parentId}>
            <Select
              name="parentId"
              defaultValue={
                values.parentId ??
                (props.mode === 'create' ? props.defaultParentId : undefined) ??
                ''
              }
            >
              <option value="" disabled>
                Elegí un ciclo anual
              </option>
              {annuals.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({formatDate(a.startDate)} al {formatDate(a.endDate)})
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}

        <div className="grid grid-cols-1 gap-s15 sm:grid-cols-2">
          <FormField label="Inicio" required error={errors.startDate} help={dateHelp}>
            <TextInput
              name="startDate"
              type="date"
              defaultValue={values.startDate ?? editing?.startDate ?? ''}
              disabled={!datesEditable}
            />
          </FormField>
          <FormField label="Fin" required error={errors.endDate}>
            <TextInput
              name="endDate"
              type="date"
              defaultValue={values.endDate ?? editing?.endDate ?? ''}
              disabled={!datesEditable}
            />
          </FormField>
        </div>

        <FormField label="Cadencia de check-in" required error={errors.checkInCadence}>
          <Select
            name="checkInCadence"
            defaultValue={values.checkInCadence ?? editing?.checkInCadence ?? 'WEEKLY'}
          >
            {Object.entries(CADENCE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>

        <div className="grid grid-cols-1 gap-s15 sm:grid-cols-2">
          <FormField
            label="Umbral de comprometidos"
            required
            error={errors.committedThreshold}
            help={THRESHOLD_HELP}
          >
            <TextInput
              name="committedThreshold"
              inputMode="decimal"
              defaultValue={
                values.committedThreshold ?? formatScore(editing?.committedThreshold ?? 1)
              }
            />
          </FormField>
          <FormField
            label="Umbral de aspiracionales"
            required
            error={errors.aspirationalThreshold}
            help={THRESHOLD_HELP}
          >
            <TextInput
              name="aspirationalThreshold"
              inputMode="decimal"
              defaultValue={
                values.aspirationalThreshold ?? formatScore(editing?.aspirationalThreshold ?? 0.7)
              }
            />
          </FormField>
        </div>
      </form>
    </Modal>
  );
}

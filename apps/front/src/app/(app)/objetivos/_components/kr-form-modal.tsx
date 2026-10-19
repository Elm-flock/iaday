'use client';

import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { createKeyResultAction, updateKeyResultAction } from '../actions';
import { KR_SCORING_LABEL, KR_TARGET_LOCKED_REASON } from '../messages';
import { SuggestOkrButton } from '../../_ai/_components/suggest-okr-button';
import {
  buildKrSuggestInput,
  formValues,
  krPrefill,
  type ObjectiveContext,
} from '../../_ai/suggest-input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { TextInput } from '@/components/ui/text-input';
import { useToast } from '@/components/ui/toast';
import { useActionForm } from '@/lib/actions/use-action-form';
import { formatNumber } from '@/lib/format';
import type { KeyResult } from '@/lib/dal/objectives';

export type PersonOption = { id: string; name: string };

type Props = {
  objectiveId: string;
  people: PersonOption[];
  /** Responsable por defecto del KR nuevo (quien lo crea). */
  defaultOwnerId: string;
  /** Objetivo publicado y sin permiso: inicio y meta se muestran deshabilitados con la razón. */
  targetLocked: boolean;
  onClose: () => void;
  keyResult?: KeyResult;
  /** Si está, la ayuda de IA está activa: se ofrece "Sugerir redacción" con este objetivo como contexto. */
  suggestContext?: ObjectiveContext;
};

const decimalText = (value: string | null) =>
  value === null ? '' : formatNumber(Number(value), Number.isInteger(Number(value)) ? 0 : 2);

/** Modal de alta/edición de un resultado clave. Se monta solo mientras está abierto. */
export function KrFormModal({
  objectiveId,
  people,
  defaultOwnerId,
  targetLocked,
  onClose,
  keyResult,
  suggestContext,
}: Props) {
  const editing = keyResult ?? null;
  // Un KR nuevo siempre lleva inicio y meta; el bloqueo aplica solo al editar uno existente.
  const lockTarget = targetLocked && editing !== null;
  const action = editing
    ? updateKeyResultAction.bind(null, objectiveId, editing.id, {
        scoring: editing.scoring,
        targetEditable: !lockTarget,
      })
    : createKeyResultAction.bind(null, objectiveId);
  const { state, onSubmit, pending } = useActionForm(action);
  const toast = useToast();
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  // Al usar una sugerencia se precargan los campos (remontados con `key`); nada se envía solo.
  const [prefill, setPrefill] = useState<Record<string, string>>({});
  const [fieldsKey, setFieldsKey] = useState(0);
  const values = { ...(state.values ?? {}), ...prefill };
  const errors = state.fieldErrors ?? {};
  const [scoring, setScoring] = useState<'DERIVED' | 'MANUAL'>(editing?.scoring ?? 'DERIVED');

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
      title={editing ? 'Editar resultado clave' : 'Agregar resultado clave'}
      description="Un resultado clave mide el avance del objetivo: numérico (de un valor inicial a una meta) o manual (se cumple o no)."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} loading={pending}>
            {editing ? 'Guardar cambios' : 'Agregar resultado clave'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        ref={formRef}
        onSubmit={onSubmit}
        className="flex flex-col gap-s15"
        noValidate
      >
        {state.status === 'error' && state.message ? (
          <Alert tone="danger">{state.message}</Alert>
        ) : null}

        <Fragment key={fieldsKey}>
          <FormField label="Resultado clave" required error={errors.title}>
            <TextInput
              name="title"
              defaultValue={values.title ?? editing?.title ?? ''}
              maxLength={200}
              placeholder="Llegar a 100 clientes activos"
            />
          </FormField>

          {editing ? (
            <p className="text-body-sm text-ink-muted">
              Tipo: {KR_SCORING_LABEL[editing.scoring]}. El tipo no se puede cambiar.
            </p>
          ) : (
            <FormField label="Cómo se mide" required error={errors.scoring}>
              <Select
                name="scoring"
                defaultValue={values.scoring ?? 'DERIVED'}
                onChange={(e) => setScoring(e.target.value as 'DERIVED' | 'MANUAL')}
              >
                {Object.entries(KR_SCORING_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>
          )}

          {scoring === 'DERIVED' ? (
            <>
              <div className="grid grid-cols-1 gap-s15 sm:grid-cols-2">
                <FormField label="Valor inicial" required error={errors.startValue}>
                  <TextInput
                    name="startValue"
                    inputMode="decimal"
                    defaultValue={values.startValue ?? decimalText(editing?.startValue ?? null)}
                    disabled={lockTarget}
                  />
                </FormField>
                <FormField label="Meta" required error={errors.targetValue}>
                  <TextInput
                    name="targetValue"
                    inputMode="decimal"
                    defaultValue={values.targetValue ?? decimalText(editing?.targetValue ?? null)}
                    disabled={lockTarget}
                  />
                </FormField>
              </div>
              {lockTarget ? (
                <p className="text-body-sm text-ink-muted" data-testid="target-locked-reason">
                  {KR_TARGET_LOCKED_REASON}
                </p>
              ) : null}
              <FormField label="Unidad" error={errors.unit} help="Por ejemplo: clientes, %, días.">
                <TextInput
                  name="unit"
                  defaultValue={values.unit ?? editing?.unit ?? ''}
                  maxLength={40}
                />
              </FormField>
            </>
          ) : null}

          <FormField label="Responsable" required error={errors.ownerId}>
            <Select
              name="ownerId"
              defaultValue={values.ownerId ?? editing?.ownerId ?? defaultOwnerId}
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormField>
        </Fragment>

        {suggestContext ? (
          <SuggestOkrButton
            scope="kr"
            buildInput={() =>
              buildKrSuggestInput(new FormData(formRef.current ?? undefined), suggestContext)
            }
            onUse={(suggestion) => {
              const kr = suggestion.keyResults[0];
              if (!kr) return;
              // Con inicio/meta bloqueados no se pisan: la IA no puede cambiar lo que la persona no puede.
              const { startValue, targetValue, ...rest } = krPrefill(kr);
              setPrefill({
                ...formValues(formRef.current),
                ...rest,
                ...(lockTarget ? {} : { startValue, targetValue }),
              });
              setFieldsKey((k) => k + 1);
            }}
          />
        ) : null}
      </form>
    </Modal>
  );
}

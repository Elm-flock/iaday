'use client';

import { useEffect, useId, useState } from 'react';
import { createCheckInAction } from '../actions';
import { CHECK_IN_ACTIONS, NOTE_MAX } from '../messages';
import type { CheckInTarget } from './check-in-target';
import { parseDecimal } from '../../objetivos/objective-form-data';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { FormField } from '@/components/ui/form-field';
import { ScoreBar } from '@/components/ui/score-bar';
import { Select } from '@/components/ui/select';
import { BandBadge } from '@/components/ui/status-badge';
import { TextInput } from '@/components/ui/text-input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useActionForm } from '@/lib/actions/use-action-form';
import { previewCheckIn } from '@/lib/check-in-preview';
import { formatNumber } from '@/lib/format';

const num = (value: string | null) =>
  value === null ? '—' : formatNumber(Number(value), Number.isInteger(Number(value)) ? 0 : 2);

const MANUAL_STEPS = Array.from({ length: 11 }, (_, i) => i / 10);

/** Décima más cercana al score actual (default del selector manual). */
const nearestTenth = (score: number) => String(Math.round(score * 10) / 10);

/** Puntaje en el preview: valor + unidad del KR. */
function Preview({
  target,
  valueText,
  manualText,
}: {
  target: CheckInTarget;
  valueText: string;
  manualText: string;
}) {
  const parsed = target.scoring === 'DERIVED' ? parseDecimal(valueText) : null;
  const preview =
    target.scoring === 'DERIVED'
      ? previewCheckIn({
          scoring: 'DERIVED',
          start: Number(target.startValue),
          target: Number(target.targetValue),
          value: parsed === null ? null : Number(parsed),
        })
      : previewCheckIn({
          scoring: 'MANUAL',
          manualScore: manualText === '' ? null : Number(manualText),
        });

  return (
    <div
      data-testid="check-in-preview"
      aria-live="polite"
      className="flex flex-col gap-s10 rounded-md border border-border bg-surface-subtle p-s15"
    >
      <p className="text-body-sm text-ink-muted">Así quedaría el resultado clave</p>
      {preview ? (
        <div className="flex flex-wrap items-center gap-s15">
          <BandBadge score={preview.score} />
          <ScoreBar score={preview.score} label="Score resultante" className="min-w-40 flex-1" />
        </div>
      ) : (
        <p className="text-body-sm text-ink-muted">
          {target.scoring === 'DERIVED'
            ? 'Ingresá el valor actual para ver el puntaje y la banda.'
            : 'Elegí un puntaje para ver la banda.'}
        </p>
      )}
    </div>
  );
}

type Props = { target: CheckInTarget; onClose: () => void };

/** Drawer para registrar un check-in. Se monta solo mientras está abierto (el estado arranca limpio). */
export function CheckInDrawer({ target, onClose }: Props) {
  const action = createCheckInAction.bind(null, {
    objectiveId: target.objectiveId,
    krId: target.krId,
    scoring: target.scoring,
  });
  const { state, onSubmit, pending } = useActionForm(action);
  const toast = useToast();
  const formId = useId();
  const values = state.values ?? {};
  const errors = state.fieldErrors ?? {};
  const [valueText, setValueText] = useState('');
  const [manualText, setManualText] = useState(nearestTenth(target.score));

  useEffect(() => {
    if (state.status === 'success') {
      toast.show(state.message ?? 'Listo.');
      onClose();
    }
  }, [state, toast, onClose]);

  return (
    <Drawer
      open
      onClose={onClose}
      title="Registrar check-in"
      description={target.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} loading={pending}>
            Registrar check-in
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-s20" noValidate>
        {state.status === 'error' && state.message ? (
          <Alert tone="danger">{state.message}</Alert>
        ) : null}

        <fieldset className="flex flex-col gap-s10">
          <legend className="mb-s5 text-body-sm text-ink-muted">¿Qué vas a hacer?</legend>
          {CHECK_IN_ACTIONS.map(({ value, label, help }) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-s10 rounded-md border border-border p-s10 has-[:checked]:border-primary has-[:checked]:bg-surface-subtle"
            >
              <input
                type="radio"
                name="action"
                value={value}
                defaultChecked={(values.action ?? 'UPDATE') === value}
                className="mt-s5 accent-primary"
              />
              <span className="flex flex-col">
                <span className="text-body text-ink">{label}</span>
                <span className="text-body-sm text-ink-muted">{help}</span>
              </span>
            </label>
          ))}
          {errors.action ? (
            <p role="alert" className="text-body-sm text-danger">
              {errors.action}
            </p>
          ) : null}
        </fieldset>

        {target.scoring === 'DERIVED' ? (
          <FormField
            label={`Valor actual${target.unit ? ` (${target.unit})` : ''}`}
            required
            error={errors.value}
            help={`Inicio ${num(target.startValue)} · Meta ${num(target.targetValue)} · Último valor ${num(target.currentValue)}${target.unit ? ` ${target.unit}` : ''}.`}
          >
            <TextInput
              name="value"
              inputMode="decimal"
              defaultValue={values.value ?? ''}
              onChange={(e) => setValueText(e.target.value)}
              placeholder="Por ejemplo 45 o 12,5"
            />
          </FormField>
        ) : (
          <FormField
            label="Puntaje"
            required
            error={errors.manualScore}
            help="Es un resultado clave manual: elegí cuánto se cumplió, de 0,0 a 1,0 en pasos de 0,1."
          >
            <Select
              name="manualScore"
              defaultValue={values.manualScore ?? nearestTenth(target.score)}
              onChange={(e) => setManualText(e.target.value)}
            >
              {MANUAL_STEPS.map((step) => (
                <option key={step} value={String(step)}>
                  {formatNumber(step, 1)}
                </option>
              ))}
            </Select>
          </FormField>
        )}

        <Preview target={target} valueText={valueText} manualText={manualText} />

        <FormField
          label="Nota"
          error={errors.note}
          help={`Opcional. Contá qué pasó o qué necesitás (hasta ${NOTE_MAX} caracteres).`}
        >
          <Textarea name="note" rows={3} maxLength={NOTE_MAX} defaultValue={values.note ?? ''} />
        </FormField>
      </form>
    </Drawer>
  );
}

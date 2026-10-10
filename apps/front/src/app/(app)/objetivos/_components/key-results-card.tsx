'use client';

import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useState, useTransition } from 'react';
import { deleteKeyResultAction } from '../actions';
import { KR_MAX, KR_MIN, KR_SCORING_LABEL } from '../messages';
import { KrFormModal, type PersonOption } from './kr-form-modal';
import { KrProgressBadge } from './progress-badge';
import { toCheckInTarget } from '../../check-ins/_components/check-in-target';
import { RegisterCheckInButton } from '../../check-ins/_components/register-check-in-button';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { ScoreBar } from '@/components/ui/score-bar';
import { useToast } from '@/components/ui/toast';
import type { KeyResult, Objective } from '@/lib/dal/objectives';
import { formatNumber } from '@/lib/format';

/** Celda de datos: en pantallas angostas la fila se apila y cada dato lleva su etiqueta (data-label). */
const cell =
  'py-s10 pr-s10 max-xl:flex max-xl:items-center max-xl:justify-between max-xl:gap-s10 max-xl:py-s5 max-xl:pr-0 max-xl:before:text-caption max-xl:before:text-ink-muted max-xl:before:content-[attr(data-label)]';

const num = (value: string | null) =>
  value === null ? '—' : formatNumber(Number(value), Number.isInteger(Number(value)) ? 0 : 2);

type Props = {
  objective: Pick<Objective, 'id' | 'status'>;
  keyResults: KeyResult[];
  people: PersonOption[];
  viewerId: string;
  /** Puede agregar/editar KRs (responsable, líder del equipo o ADMIN) y el objetivo sigue abierto. */
  canEdit: boolean;
  /** Puede cambiar inicio/meta tras publicar. */
  canChangeTarget: boolean;
  /** Por KR: `null` si puede registrar check-ins; si no, la razón (se muestra deshabilitado con explicación). */
  checkInReasons: Record<string, string | null>;
};

/** KRs del objetivo: tabla con inicio/meta/actual/unidad/score/banda y alta/edición/baja en modal. */
export function KeyResultsCard({
  objective,
  keyResults,
  people,
  viewerId,
  canEdit,
  canChangeTarget,
  checkInReasons,
}: Props) {
  const [modal, setModal] = useState<{ kr?: KeyResult } | null>(null);
  const [toDelete, setToDelete] = useState<KeyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const closeModal = useCallback(() => setModal(null), []);

  const isDraft = objective.status === 'DRAFT';
  const open = objective.status !== 'CLOSED';
  const names = new Map(people.map((p) => [p.id, p.name]));
  const full = keyResults.length >= KR_MAX;
  const targetLocked = !isDraft && !canChangeTarget;
  const showCheckIn = !isDraft;
  const showActions = (canEdit && open) || showCheckIn;
  const blockedReason = Object.values(checkInReasons).find((r) => r !== null) ?? null;

  function remove(kr: KeyResult) {
    startTransition(async () => {
      const result = await deleteKeyResultAction(objective.id, kr.id);
      setToDelete(null);
      if (result.status === 'success') {
        setError(null);
        toast.show(result.message ?? 'Listo.');
      } else {
        setError(result.message ?? 'No pudimos quitar el resultado clave. Probá de nuevo.');
      }
    });
  }

  const addButton =
    canEdit && open ? (
      <Button
        variant="secondary"
        icon={<Plus size={18} strokeWidth={1.75} aria-hidden="true" />}
        disabled={full}
        aria-describedby={full ? 'kr-full-reason' : undefined}
        onClick={() => setModal({})}
      >
        Agregar resultado clave
      </Button>
    ) : null;

  return (
    <Card
      title={`Resultados clave (${keyResults.length} de ${KR_MAX})`}
      actions={
        <div className="flex flex-col items-end gap-s5">
          {addButton}
          {full && canEdit && open ? (
            <span id="kr-full-reason" className="text-caption text-ink-muted">
              Llegó al máximo de {KR_MAX}. Quitá uno en borrador para agregar otro.
            </span>
          ) : null}
        </div>
      }
    >
      {showCheckIn && blockedReason ? (
        <p id="check-in-reason" className="mb-s15 text-body-sm text-ink-muted">
          {blockedReason}
        </p>
      ) : null}
      {error ? (
        <Alert tone="danger" className="mb-s15">
          {error}
        </Alert>
      ) : null}

      {keyResults.length === 0 ? (
        <EmptyState
          title="Todavía no hay resultados clave"
          description={`Para publicar el objetivo necesitás al menos ${KR_MIN}.`}
        />
      ) : (
        <div className="overflow-x-auto">
          <table
            role="table"
            className="w-full border-collapse text-left text-body-sm max-xl:block"
          >
            <caption className="sr-only">Resultados clave del objetivo</caption>
            <thead role="rowgroup" className="max-xl:sr-only">
              <tr role="row" className="border-b border-border text-ink-muted">
                <th role="columnheader" scope="col" className="py-s10 pr-s10 font-normal">
                  Resultado clave
                </th>
                <th role="columnheader" scope="col" className="py-s10 pr-s10 font-normal">
                  Tipo
                </th>
                <th
                  role="columnheader"
                  scope="col"
                  className="py-s10 pr-s10 text-right font-normal"
                >
                  Inicio
                </th>
                <th
                  role="columnheader"
                  scope="col"
                  className="py-s10 pr-s10 text-right font-normal"
                >
                  Meta
                </th>
                <th
                  role="columnheader"
                  scope="col"
                  className="py-s10 pr-s10 text-right font-normal"
                >
                  Actual
                </th>
                <th role="columnheader" scope="col" className="py-s10 pr-s10 font-normal">
                  Unidad
                </th>
                <th role="columnheader" scope="col" className="py-s10 pr-s10 font-normal">
                  Score
                </th>
                <th role="columnheader" scope="col" className="py-s10 pr-s10 font-normal">
                  Banda
                </th>
                {showActions ? (
                  <th role="columnheader" scope="col" className="py-s10 font-normal">
                    <span className="sr-only">Acciones</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody role="rowgroup" className="max-xl:block">
              {keyResults.map((kr) => (
                <tr
                  key={kr.id}
                  role="row"
                  className="border-b border-border align-middle last:border-0 max-xl:mb-s10 max-xl:block max-xl:rounded-md max-xl:border max-xl:p-s15 max-xl:last:border"
                >
                  <td role="cell" className="py-s10 pr-s10 max-xl:block max-xl:pr-0">
                    <span className="block font-bold">{kr.title}</span>
                    <span className="text-caption text-ink-muted">
                      Responsable: {names.get(kr.ownerId) ?? 'sin nombre'}
                      {kr.ownerId === viewerId ? ' (vos)' : ''}
                    </span>
                  </td>
                  <td role="cell" data-label="Tipo" className={cell + ' text-ink'}>
                    {KR_SCORING_LABEL[kr.scoring]}
                  </td>
                  <td role="cell" data-label="Inicio" className={cell + ' text-right tabular-nums'}>
                    {num(kr.startValue)}
                  </td>
                  <td role="cell" data-label="Meta" className={cell + ' text-right tabular-nums'}>
                    {num(kr.targetValue)}
                  </td>
                  <td role="cell" data-label="Actual" className={cell + ' text-right tabular-nums'}>
                    {num(kr.currentValue)}
                  </td>
                  <td role="cell" data-label="Unidad" className={cell + ' text-ink'}>
                    {kr.unit ?? '—'}
                  </td>
                  <td role="cell" data-label="Score" className={cell}>
                    {kr.hasCheckIns ? (
                      <ScoreBar
                        score={kr.score}
                        label={`Score de ${kr.title}`}
                        className="min-w-32"
                      />
                    ) : (
                      <span className="text-ink-muted" title="Todavía no hay check-ins">
                        —
                      </span>
                    )}
                  </td>
                  <td role="cell" data-label="Banda" className={cell}>
                    <KrProgressBadge kr={kr} />
                  </td>
                  {showActions ? (
                    <td role="cell" className="py-s10 max-xl:block max-xl:pt-s10">
                      <div className="flex items-center justify-end gap-s5">
                        {showCheckIn ? (
                          <RegisterCheckInButton
                            target={toCheckInTarget(kr)}
                            disabled={checkInReasons[kr.id] != null}
                            disabledReasonId="check-in-reason"
                          />
                        ) : null}
                        {canEdit && open ? (
                          <>
                            <IconButton
                              tooltipAlign="end"
                              aria-label={`Editar ${kr.title}`}
                              onClick={() => setModal({ kr })}
                            >
                              <Pencil size={18} strokeWidth={1.75} aria-hidden="true" />
                            </IconButton>
                            <IconButton
                              tooltipAlign="end"
                              aria-label={
                                isDraft
                                  ? `Quitar ${kr.title}`
                                  : `Quitar ${kr.title} (solo se pueden quitar en borrador)`
                              }
                              disabled={!isDraft}
                              onClick={() => setToDelete(kr)}
                            >
                              <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
                            </IconButton>
                          </>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {canEdit && open && !isDraft ? (
            <p className="mt-s10 text-caption text-ink-muted">
              Después de publicar no se pueden quitar resultados clave.
            </p>
          ) : null}
        </div>
      )}

      {modal ? (
        <KrFormModal
          objectiveId={objective.id}
          people={people}
          defaultOwnerId={viewerId}
          targetLocked={targetLocked}
          keyResult={modal.kr}
          onClose={closeModal}
        />
      ) : null}

      <ConfirmDialog
        open={toDelete !== null}
        title="Quitar resultado clave"
        description={`Vas a quitar "${toDelete?.title ?? ''}" del objetivo. Esta acción no se puede deshacer.`}
        confirmLabel="Quitar resultado clave"
        loading={pending}
        onConfirm={() => toDelete && remove(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </Card>
  );
}

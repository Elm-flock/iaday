import type { AssistantPlan } from '../../generated/prisma/client';
import type { PlanDto, StepResultDto } from './dto/assistant.dto';
import type { PlanIssue, ResolvedAction } from './domain/plan-validate';

/** Resultado de un paso tal como se persiste (nunca incluye la clave inicial de un alta). */
export interface StoredStep {
  index: number;
  status: 'OK' | 'FAILED' | 'SKIPPED';
  entity?: { type: string; id: string; url: string | null };
  error?: { code: string; message: string };
}

/** Fila de la base -> PlanDto. Los pasos se arman con la descripción de la acción correspondiente. */
export function toPlanDto(row: AssistantPlan): PlanDto {
  const actions = (row.actions ?? []) as unknown as ResolvedAction[];
  const stored = (row.stepResults ?? null) as unknown as StoredStep[] | null;
  const steps: StepResultDto[] | undefined = stored
    ? actions.map((a, index) => {
        const s = stored.find((x) => x.index === index);
        return {
          index,
          status: s?.status ?? 'SKIPPED',
          description: a.description,
          ...(s?.entity ? { entity: s.entity } : {}),
          ...(s?.error ? { error: s.error } : {}),
        };
      })
    : undefined;
  return {
    id: row.id,
    status: row.status,
    summary: row.summary,
    assumptions: row.assumptions as unknown as string[],
    actions: actions.map((a, index) => ({ index, type: a.type, description: a.description })),
    issues: row.issues as unknown as PlanIssue[],
    warnings: row.warnings as unknown as PlanIssue[],
    planHash: row.planHash,
    expiresAt: row.expiresAt,
    confirmedAt: row.confirmedAt,
    finishedAt: row.finishedAt,
    ...(steps ? { steps } : {}),
  };
}

import type { KeyResult } from '../../generated/prisma/client';
import { isCheckInOverdue, type CheckInCadence } from '../check-ins/domain/overdue';
import { KeyResultDto } from './dto/key-result.dto';
import { ObjectiveDto } from './dto/objective.dto';
import type { ObjectiveRecord } from './okrs-access.service';

const dec = (v: { toString(): string } | null): string | null => (v === null ? null : v.toString());

/** Contexto del objetivo necesario para calcular si un KR está vencido. */
export interface OverdueContext {
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  publishedAt: Date | null;
  createdAt: Date;
  checkInCadence: CheckInCadence;
}

/** `now` se inyecta para que el cálculo sea determinista en tests. */
export function toKeyResultDto(kr: KeyResult, context: OverdueContext, now: Date): KeyResultDto {
  return {
    id: kr.id,
    objectiveId: kr.objectiveId,
    ownerId: kr.ownerId,
    title: kr.title,
    scoring: kr.scoring,
    unit: kr.unit,
    startValue: dec(kr.startValue),
    targetValue: dec(kr.targetValue),
    currentValue: dec(kr.currentValue),
    score: Number(kr.score),
    position: kr.position,
    lastCheckInAt: kr.lastCheckInAt,
    overdue: isCheckInOverdue(
      kr.lastCheckInAt,
      context.publishedAt ?? context.createdAt,
      context.checkInCadence,
      now,
      context.status,
    ),
  };
}

export function toObjectiveDto(o: ObjectiveRecord, now: Date): ObjectiveDto {
  return {
    id: o.id,
    cycleId: o.cycleId,
    ownerUserId: o.ownerUserId,
    ownerTeamId: o.ownerTeamId,
    parentObjectiveId: o.parentObjectiveId,
    title: o.title,
    description: o.description,
    origin: o.origin,
    type: o.type,
    status: o.status,
    score: Number(o.score),
    finalScore: o.finalScore === null ? null : Number(o.finalScore),
    achieved: o.achieved,
    createdById: o.createdById,
    publishedAt: o.publishedAt,
    closedAt: o.closedAt,
    createdAt: o.createdAt,
    keyResults: o.keyResults.map((kr) =>
      toKeyResultDto(kr, { ...o, checkInCadence: o.cycle.checkInCadence }, now),
    ),
  };
}

export function overdueContext(o: ObjectiveRecord): OverdueContext {
  return {
    status: o.status,
    publishedAt: o.publishedAt,
    createdAt: o.createdAt,
    checkInCadence: o.cycle.checkInCadence,
  };
}

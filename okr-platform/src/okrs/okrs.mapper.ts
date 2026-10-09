import type { KeyResult } from '../../generated/prisma/client';
import { KeyResultDto } from './dto/key-result.dto';
import { ObjectiveDto } from './dto/objective.dto';
import type { ObjectiveRecord } from './okrs-access.service';

const dec = (v: { toString(): string } | null): string | null => (v === null ? null : v.toString());

export function toKeyResultDto(kr: KeyResult): KeyResultDto {
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
  };
}

export function toObjectiveDto(o: ObjectiveRecord): ObjectiveDto {
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
    keyResults: o.keyResults.map(toKeyResultDto),
  };
}

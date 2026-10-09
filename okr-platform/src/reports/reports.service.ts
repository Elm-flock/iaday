import { Injectable, NotFoundException } from '@nestjs/common';
import type { KeyResult, Objective } from '../../generated/prisma/client';
import { bandOf } from '../okrs/domain/bands';
import { originMix } from '../okrs/domain/origin-mix';
import { PrismaService } from '../prisma/prisma.service';
import { ReportKeyResultDto, ReportObjectiveDto, TeamReportDto } from './dto/team-report.dto';

const dec = (v: { toString(): string } | null): string | null => (v === null ? null : v.toString());

type ObjectiveWithKrs = Objective & { keyResults: KeyResult[] };

const toKeyResult = (kr: KeyResult): ReportKeyResultDto => {
  const score = Number(kr.score);
  return {
    id: kr.id,
    title: kr.title,
    scoring: kr.scoring,
    unit: kr.unit,
    startValue: dec(kr.startValue),
    targetValue: dec(kr.targetValue),
    currentValue: dec(kr.currentValue),
    score,
    band: bandOf(score),
    lastCheckInAt: kr.lastCheckInAt,
  };
};

const toObjective = (o: ObjectiveWithKrs): ReportObjectiveDto => {
  const score = Number(o.score);
  return {
    id: o.id,
    title: o.title,
    type: o.type,
    origin: o.origin,
    // El filtro de la consulta excluye DRAFT: acá solo llegan PUBLISHED/CLOSED.
    status: o.status as 'PUBLISHED' | 'CLOSED',
    score,
    band: bandOf(score),
    finalScore: o.finalScore === null ? null : Number(o.finalScore),
    achieved: o.achieved,
    keyResults: o.keyResults.map(toKeyResult),
  };
};

const OBJECTIVE_INCLUDE = { keyResults: { orderBy: { position: 'asc' } } } as const;
const OBJECTIVE_ORDER = [{ createdAt: 'asc' }, { id: 'asc' }] as const;

/**
 * Datos agregados del equipo para el PDF. Sin feedback (ni lo consulta), sin reconocimientos,
 * sin rankings: los miembros van por nombre y los objetivos por fecha de alta. Solo objetivos
 * publicados o cerrados (los borradores no son públicos).
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async teamReport(teamId: string, cycleId: string, now = new Date()): Promise<TeamReportDto> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        name: true,
        members: {
          select: { user: { select: { id: true, name: true } } },
        },
      },
    });
    if (!team) throw new NotFoundException('Equipo no encontrado');
    const cycle = await this.prisma.cycle.findUnique({ where: { id: cycleId } });
    if (!cycle) throw new NotFoundException('Ciclo no encontrado');

    const members = team.members
      .map((m) => m.user)
      .sort((a, b) => a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id));
    const memberIds = members.map((m) => m.id);

    // Una sola consulta con OR (cada objetivo aparece una vez): propios del equipo + individuales
    // de sus miembros directos en el ciclo; los subequipos no se agregan (igual que GET /teams/:id).
    const objectives = await this.prisma.objective.findMany({
      where: {
        cycleId,
        status: { in: ['PUBLISHED', 'CLOSED'] },
        OR: [{ ownerTeamId: teamId }, { ownerUserId: { in: memberIds } }],
      },
      include: OBJECTIVE_INCLUDE,
      orderBy: [...OBJECTIVE_ORDER],
    });

    const byUser = new Map<string, ReportObjectiveDto[]>();
    const teamObjectives: ReportObjectiveDto[] = [];
    for (const objective of objectives) {
      const dto = toObjective(objective);
      if (objective.ownerTeamId === teamId) teamObjectives.push(dto);
      else if (objective.ownerUserId) {
        byUser.set(objective.ownerUserId, [...(byUser.get(objective.ownerUserId) ?? []), dto]);
      }
    }

    return {
      team: { id: team.id, name: team.name },
      cycle: {
        id: cycle.id,
        name: cycle.name,
        kind: cycle.kind,
        status: cycle.status,
        committedThreshold: Number(cycle.committedThreshold),
        aspirationalThreshold: Number(cycle.aspirationalThreshold),
      },
      generatedAt: now,
      originMix: originMix(objectives),
      teamObjectives,
      members: members.map((m) => ({
        userId: m.id,
        name: m.name,
        objectives: byUser.get(m.id) ?? [],
      })),
    };
  }
}

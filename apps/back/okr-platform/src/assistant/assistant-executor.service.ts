import { HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { CreateCycleDto } from '../cycles/dto/cycle.dto';
import { CyclesService } from '../cycles/cycles.service';
import { KeyResultsService } from '../okrs/key-results.service';
import { CreateKeyResultDto, UpdateKeyResultDto } from '../okrs/dto/key-result-input.dto';
import { CreateObjectiveDto } from '../okrs/dto/objective.dto';
import { ObjectivesService } from '../okrs/objectives.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamDto, SetMemberDto } from '../teams/dto/team.dto';
import { TeamsService } from '../teams/teams.service';
import { CreateUserDto } from '../users/dto/user.dto';
import { UsersService } from '../users/users.service';
import type { AuthUser } from '../common/types/auth-user';
import { validateActionDto } from './action-dto';
import { assistantError } from './assistant.errors';
import { AssistantDigestService } from './assistant-digest.service';
import { AssistantRetentionService } from './assistant-retention.service';
import type { ExecutionResultDto, PlanDto, StepResultDto } from './dto/assistant.dto';
import { entityUrl } from './domain/entity-url';
import { computePlanHash, hashesMatch } from './domain/plan-hash';
import { buildActionCall } from './domain/plan-to-dto';
import { finalStatus, isExpired } from './domain/plan-state';
import type { ResolvedAction } from './domain/plan-validate';
import { toPlanDto, type StoredStep } from './plan-view';

/** Fallo de un paso, ya traducido a { code, message } en español. */
class StepError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface Created {
  id: string;
  objectiveId?: string;
}

interface StepOutcome {
  entity?: { type: string; id: string; objectiveId?: string | null };
  secret?: string;
}

const STATUS_CODE: Record<number, string> = {
  400: 'DTO_INVALID',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'RULE_VIOLATION',
};

/**
 * Ejecuta un plan confirmado EN PROCESO con la persona ADMIN como actor, llamando a los mismos servicios
 * que la API HTTP (mismas reglas de dominio). Replica lo que hace la capa HTTP: relee rol y estado de la
 * base, valida cada payload con las opciones del ValidationPipe global y traduce los errores.
 * Se frena en el primer fallo (sin reintentos ni rollback: lo hecho queda hecho).
 */
@Injectable()
export class AssistantExecutorService {
  private readonly logger = new Logger(AssistantExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly teams: TeamsService,
    private readonly cycles: CyclesService,
    private readonly objectives: ObjectivesService,
    private readonly keyResults: KeyResultsService,
    private readonly retention: AssistantRetentionService,
    private readonly digest: AssistantDigestService,
  ) {}

  async confirm(
    actor: AuthUser,
    planId: string,
    planHash: string,
    now = new Date(),
  ): Promise<ExecutionResultDto> {
    // (1) El plan es de quien lo pidió; si no, 404 (no se revela que existe).
    let plan = await this.prisma.assistantPlan.findFirst({
      where: { id: planId, requestedById: actor.id },
    });
    if (!plan) throw assistantError('ASSISTANT_PLAN_NOT_FOUND');

    // (2) Se vuelve a leer rol y estado: el JWT pudo emitirse antes de un cambio de rol o una baja.
    const current = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { id: true, role: true, active: true },
    });
    if (!current || !current.active || current.role !== 'ADMIN') throw new NotFoundException();
    const admin: AuthUser = { id: current.id, role: 'ADMIN' };

    // Un EXECUTING sin actividad hace más de 5 minutos es un proceso que murió.
    if (plan.status === 'EXECUTING') {
      await this.retention.sweepInterrupted(now);
      plan = (await this.prisma.assistantPlan.findUnique({ where: { id: planId } })) ?? plan;
    }

    // (3) Vencimiento.
    if (plan.status === 'EXPIRED') throw assistantError('ASSISTANT_PLAN_EXPIRED');
    if (plan.status === 'PROPOSED' && isExpired(plan.expiresAt, now)) {
      await this.prisma.assistantPlan.updateMany({
        where: { id: plan.id, status: 'PROPOSED' },
        data: { status: 'EXPIRED' },
      });
      throw assistantError('ASSISTANT_PLAN_EXPIRED');
    }

    // (4) Hash: el que mandó el cliente, el guardado y el recalculado desde las acciones deben coincidir.
    const recomputed = computePlanHash({
      actions: plan.actions,
      requestedById: plan.requestedById,
      expiresAt: plan.expiresAt,
    });
    if (!hashesMatch(planHash, plan.planHash) || !hashesMatch(plan.planHash, recomputed)) {
      this.logger.warn(`Hash de plan no coincide (planId=${plan.id}, adminId=${actor.id})`);
      throw assistantError('ASSISTANT_PLAN_HASH_MISMATCH');
    }

    // (5) Estado.
    if (plan.status === 'INVALID') {
      throw assistantError('ASSISTANT_PLAN_INVALID', { issues: plan.issues });
    }
    if (plan.status !== 'PROPOSED') {
      throw assistantError('ASSISTANT_PLAN_ALREADY_DECIDED', { result: toPlanDto(plan) });
    }

    // (6) Cerrojo atómico PROPOSED -> EXECUTING: de dos confirmaciones simultáneas, gana una.
    const { count } = await this.prisma.assistantPlan.updateMany({
      where: { id: plan.id, status: 'PROPOSED', planHash, expiresAt: { gt: now } },
      data: { status: 'EXECUTING', confirmedAt: now },
    });
    if (count === 0) {
      const latest = await this.prisma.assistantPlan.findUnique({ where: { id: plan.id } });
      throw assistantError('ASSISTANT_PLAN_ALREADY_DECIDED', {
        result: latest ? toPlanDto(latest) : undefined,
      });
    }

    const actions = plan.actions as unknown as ResolvedAction[];
    await this.prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: 'ASSISTANT_PLAN_CONFIRMED',
        entityType: 'AssistantPlan',
        entityId: plan.id,
        after: { via: 'assistant', planId: plan.id, actions: actions.length },
      },
    });

    // (7) Pasos, en orden, hasta el primer fallo.
    const created = new Map<string, Created>();
    const stored: StoredStep[] = [];
    const secrets = new Map<number, string>();
    let failed = false;
    for (const action of actions) {
      if (failed) {
        stored.push({ index: action.index, status: 'SKIPPED' });
        continue;
      }
      try {
        const outcome = await this.runStep(admin, action, created);
        const step: StoredStep = { index: action.index, status: 'OK' };
        if (outcome.entity) {
          step.entity = {
            type: outcome.entity.type,
            id: outcome.entity.id,
            url: entityUrl(outcome.entity.type, outcome.entity.id, {
              objectiveId: outcome.entity.objectiveId,
            }),
          };
        }
        if (outcome.secret) secrets.set(action.index, outcome.secret);
        stored.push(step);
        await this.audit(
          admin,
          plan.id,
          action,
          'ASSISTANT_ACTION_EXECUTED',
          step.entity?.type,
          step.entity?.id,
        );
      } catch (error) {
        const stepError = this.toStepError(error);
        failed = true;
        stored.push({
          index: action.index,
          status: 'FAILED',
          error: { code: stepError.code, message: stepError.message },
        });
        await this.audit(
          admin,
          plan.id,
          action,
          'ASSISTANT_ACTION_FAILED',
          undefined,
          undefined,
          stepError.code,
        );
      }
      // Persistir tras cada paso también sirve de latido para el barrido de INTERRUPTED.
      await this.prisma.assistantPlan.update({
        where: { id: plan.id },
        data: { stepResults: stored as unknown as Prisma.InputJsonValue },
      });
    }

    // (8) Estado final y mensaje determinista (sin la clave inicial).
    const status = finalStatus(stored) as 'EXECUTED' | 'PARTIAL' | 'FAILED';
    const finishedAt = new Date();
    const row = await this.prisma.assistantPlan.update({
      where: { id: plan.id },
      data: { status, finishedAt, stepResults: stored as unknown as Prisma.InputJsonValue },
    });
    await this.prisma.assistantMessage.create({
      data: {
        adminId: admin.id,
        role: 'ASSISTANT',
        kind: 'EXECUTION_RESULT',
        text: resultText(status, stored, actions.length).slice(0, 2000),
        planId: plan.id,
        payload: { planId: plan.id, status, steps: stored } as unknown as Prisma.InputJsonValue,
      },
    });
    this.digest.invalidate();

    const planDto = toPlanDto(row);
    const steps: StepResultDto[] = (planDto.steps ?? []).map((s) => {
      const secret = secrets.get(s.index);
      return secret ? { ...s, oneTimeSecret: secret } : s;
    });
    return { planId: plan.id, status, steps, plan: planDto };
  }

  async discard(actor: AuthUser, planId: string): Promise<PlanDto> {
    const plan = await this.prisma.assistantPlan.findFirst({
      where: { id: planId, requestedById: actor.id },
    });
    if (!plan) throw assistantError('ASSISTANT_PLAN_NOT_FOUND');
    const { count } = await this.prisma.assistantPlan.updateMany({
      where: { id: plan.id, status: { in: ['PROPOSED', 'INVALID'] } },
      data: { status: 'DISCARDED', finishedAt: new Date() },
    });
    if (count === 0) {
      const latest = await this.prisma.assistantPlan.findUnique({ where: { id: plan.id } });
      throw assistantError('ASSISTANT_PLAN_ALREADY_DECIDED', {
        result: latest ? toPlanDto(latest) : undefined,
      });
    }
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'ASSISTANT_PLAN_DISCARDED',
        entityType: 'AssistantPlan',
        entityId: plan.id,
        after: { via: 'assistant', planId: plan.id },
      },
    });
    return toPlanDto(await this.prisma.assistantPlan.findUniqueOrThrow({ where: { id: plan.id } }));
  }

  // ------------------------------------------------------------------ pasos

  private async runStep(
    admin: AuthUser,
    action: ResolvedAction,
    created: Map<string, Created>,
  ): Promise<StepOutcome> {
    const call = buildActionCall(action, (ref) =>
      ref.kind === 'EXISTING' ? ref.id : (created.get(ref.ref)?.id ?? null),
    );
    if (!call.ok) throw new StepError(call.code, call.message);
    const checked = await validateActionDto(call.value);
    if (!checked.ok) throw new StepError('DTO_INVALID', checked.message);
    const dto = checked.dto;
    const ids = call.value.ids;

    const remember = (id: string, extra: Partial<Created> = {}) => {
      if (action.ref) created.set(action.ref, { id, ...extra });
    };

    switch (action.type) {
      case 'CREATE_USER': {
        const user = await this.users.create(dto as CreateUserDto);
        remember(user.id);
        return { entity: { type: 'User', id: user.id }, secret: user.initialPassword };
      }
      case 'CREATE_TEAM': {
        const team = await this.teams.create(dto as CreateTeamDto);
        remember(team.id);
        return { entity: { type: 'Team', id: team.id } };
      }
      case 'SET_TEAM_MEMBER':
        await this.teams.setMember(ids.team, ids.user, (dto as SetMemberDto).isLead ?? false);
        return { entity: { type: 'Team', id: ids.team } };
      case 'REMOVE_TEAM_MEMBER':
        await this.teams.removeMember(ids.team, ids.user);
        return { entity: { type: 'Team', id: ids.team } };
      case 'CREATE_CYCLE': {
        const cycle = await this.cycles.create(dto as CreateCycleDto);
        remember(cycle.id);
        return { entity: { type: 'Cycle', id: cycle.id } };
      }
      case 'ACTIVATE_CYCLE':
        await this.cycles.activate(admin, ids.cycle);
        return { entity: { type: 'Cycle', id: ids.cycle } };
      case 'CREATE_OBJECTIVE': {
        const objective = await this.objectives.create(admin, dto as CreateObjectiveDto);
        remember(objective.id);
        return { entity: { type: 'Objective', id: objective.id } };
      }
      case 'CREATE_KEY_RESULT': {
        const kr = await this.keyResults.create(admin, ids.objective, dto as CreateKeyResultDto);
        remember(kr.id, { objectiveId: kr.objectiveId });
        return { entity: { type: 'KeyResult', id: kr.id, objectiveId: kr.objectiveId } };
      }
      case 'SET_KEY_RESULT_OWNER': {
        const kr = await this.keyResults.update(admin, ids.keyResult, dto as UpdateKeyResultDto);
        return { entity: { type: 'KeyResult', id: kr.id, objectiveId: kr.objectiveId } };
      }
      default:
        throw new StepError('UNKNOWN_ACTION', 'Esta acción no está permitida para el asistente.');
    }
  }

  private toStepError(error: unknown): StepError {
    if (error instanceof StepError) return error;
    if (error instanceof HttpException) {
      const status = error.getStatus();
      const res = error.getResponse();
      const body = typeof res === 'object' && res !== null ? (res as Record<string, unknown>) : {};
      const raw = body.message ?? (typeof res === 'string' ? res : error.message);
      const message = Array.isArray(raw)
        ? raw.join('; ')
        : typeof raw === 'string'
          ? raw
          : JSON.stringify(raw);
      const code =
        typeof body.code === 'string' ? body.code : (STATUS_CODE[status] ?? 'RULE_VIOLATION');
      return new StepError(code, message);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002')
        return new StepError('CONFLICT', 'Ya existe un registro con esos datos.');
      if (error.code === 'P2003')
        return new StepError('CONFLICT', 'La operación viola una relación con otro registro.');
      if (error.code === 'P2025') return new StepError('NOT_FOUND', 'No se encontró el recurso.');
    }
    // Nada de detalles: un error de Prisma puede incluir los datos enviados (p. ej. el hash de una clave).
    this.logger.error(
      `Paso del asistente falló con un error inesperado (${(error as Error)?.name})`,
    );
    return new StepError(
      'INTERNAL',
      'Falló por un error interno. No se hicieron los pasos siguientes.',
    );
  }

  private audit(
    admin: AuthUser,
    planId: string,
    action: ResolvedAction,
    kind: 'ASSISTANT_ACTION_EXECUTED' | 'ASSISTANT_ACTION_FAILED',
    entityType?: string,
    entityId?: string,
    errorCode?: string,
  ) {
    // Sin texto libre: solo ids, tipo de acción, número de paso y código de error.
    return this.prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: kind,
        entityType: entityType ?? 'AssistantPlan',
        entityId: entityId ?? planId,
        after: {
          via: 'assistant',
          planId,
          step: action.index,
          actionType: action.type,
          ...(errorCode ? { errorCode } : {}),
        },
      },
    });
  }
}

/** Texto determinista del resultado: no incluye claves iniciales. */
function resultText(
  status: 'EXECUTED' | 'PARTIAL' | 'FAILED',
  steps: StoredStep[],
  total: number,
): string {
  const failed = steps.find((s) => s.status === 'FAILED');
  const done = steps.filter((s) => s.status === 'OK').length;
  if (status === 'EXECUTED') return `Listo: se hicieron los ${total} pasos del plan.`;
  const why = failed?.error ? ` ${failed.error.message}` : '';
  if (status === 'PARTIAL') {
    return `Se hicieron ${done} de ${total} pasos. El paso ${(failed?.index ?? 0) + 1} falló.${why} Los pasos siguientes no se hicieron. Lo que ya se hizo quedó hecho: podés pedirme un plan para lo que falta.`;
  }
  return `No se pudo hacer el primer paso.${why} No se cambió nada.`;
}

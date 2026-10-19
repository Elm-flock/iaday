import { Injectable } from '@nestjs/common';
import { AdaptationRequestsService } from '../adaptation-requests/adaptation-requests.service';
import { AuditService } from '../audit/audit.service';
import type { AuditActionName } from '../audit/dto/audit.dto';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import type { AdaptationRequestDto } from '../adaptation-requests/dto/adaptation-request.dto';
import type { QueryResultDto, QueryRowDto, RequestRowDto } from './dto/assistant.dto';
import type {
  ResolvedAuditQuery,
  ResolvedQuery,
  ResolvedRequestsQuery,
} from './domain/query-validate';

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administración',
  LEADER: 'Líder',
  MEMBER: 'Integrante',
};

const day = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Consultas de SOLO LECTURA pedidas por el asistente. El agente solo traduce la pregunta a un filtro
 * tipado; acá se ejecuta con los servicios existentes y se renderiza de forma determinista: los
 * registros NUNCA vuelven al LLM.
 */
@Injectable()
export class AssistantQueryService {
  constructor(
    private readonly audit: AuditService,
    private readonly requests: AdaptationRequestsService,
    private readonly prisma: PrismaService,
  ) {}

  run(actor: AuthUser, query: ResolvedQuery): Promise<QueryResultDto> {
    return query.type === 'AUDIT_SEARCH' ? this.runAudit(query) : this.runRequests(actor, query);
  }

  private async runAudit(q: ResolvedAuditQuery): Promise<QueryResultDto> {
    const page = await this.audit.list({
      action: (q.action ?? undefined) as AuditActionName | undefined,
      entityType: q.entity?.entityType,
      entityId: q.entity?.id,
      actorId: q.actor?.id,
      from: q.from ?? undefined,
      to: q.to ?? undefined,
      page: 1,
      limit: q.limit,
    });

    const actorIds = [...new Set(page.items.map((i) => i.actorId).filter((x): x is string => !!x))];
    const labels = await this.entityLabels(page.items);
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true },
    });
    const actorName = new Map(actors.map((a) => [a.id, a.name]));

    const rows: QueryRowDto[] = page.items.map((i) => ({
      at: i.createdAt,
      actorName: i.actorId ? (actorName.get(i.actorId) ?? null) : null,
      action: i.action,
      entityType: i.entityType,
      entityLabel: labels.get(`${i.entityType}:${i.entityId}`) ?? null,
      change: roleChange(i.action, i.before, i.after),
    }));

    const what = q.entity ? ` de ${q.entity.label}` : '';
    return {
      type: 'AUDIT_SEARCH',
      total: page.total,
      auditRows: rows,
      requestRows: [],
      link: `/admin/auditoria${auditQueryString(q)}`,
      summary:
        page.total === 0
          ? `No encontré movimientos${what} en la auditoría con ese filtro.`
          : `Encontré ${page.total} ${page.total === 1 ? 'movimiento' : 'movimientos'}${what} en la auditoría${page.total > rows.length ? `; te muestro los ${rows.length} más recientes` : ''}.`,
    };
  }

  private async runRequests(actor: AuthUser, q: ResolvedRequestsQuery): Promise<QueryResultDto> {
    // El listado del módulo filtra por un estado; con varios se pide cada uno y se une.
    const statuses = q.status ?? [undefined];
    const items: AdaptationRequestDto[] = [];
    let total = 0;
    for (const status of statuses) {
      const page = await this.requests.listAll(actor, {
        status,
        overdue: q.overdueOnly ? true : undefined,
        page: 1,
        limit: q.limit,
      });
      items.push(...page.items);
      total += page.total;
    }
    const filtered = q.assignee ? items.filter((r) => r.assigneeId === q.assignee!.id) : items;
    const rows: RequestRowDto[] = filtered
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .slice(0, q.limit)
      .map((r) => ({
        subject: r.subject,
        preferredFormat: r.preferredFormat,
        status: r.status,
        dueDate: r.dueDate,
        overdue: r.overdue,
        assigneeName: r.assigneeName,
        // Administración ya ve a quien pidió en su pantalla de gestión; acá solo se renderiza para ella.
        requesterName: r.requesterName,
      }));
    const params = new URLSearchParams();
    if (q.status?.length === 1) params.set('estado', q.status[0]);
    if (q.overdueOnly) params.set('vencidos', '1');
    const qs = params.toString();
    return {
      type: 'ADAPTATION_REQUESTS_LIST',
      total: q.assignee ? filtered.length : total,
      auditRows: [],
      requestRows: rows,
      link: `/admin/pedidos-adaptacion${qs ? `?${qs}` : ''}`,
      summary:
        rows.length === 0
          ? 'No encontré pedidos de documentos adaptados con ese filtro.'
          : `Encontré ${q.assignee ? filtered.length : total} ${(q.assignee ? filtered.length : total) === 1 ? 'pedido' : 'pedidos'} de documentos adaptados.`,
    };
  }

  private async entityLabels(
    rows: { entityType: string; entityId: string }[],
  ): Promise<Map<string, string>> {
    const ids = (type: string) => [
      ...new Set(rows.filter((r) => r.entityType === type).map((r) => r.entityId)),
    ];
    const [users, teams, cycles, objectives, krs] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids('User') } },
        select: { id: true, name: true },
      }),
      this.prisma.team.findMany({
        where: { id: { in: ids('Team') } },
        select: { id: true, name: true },
      }),
      this.prisma.cycle.findMany({
        where: { id: { in: ids('Cycle') } },
        select: { id: true, name: true },
      }),
      this.prisma.objective.findMany({
        where: { id: { in: ids('Objective') } },
        select: { id: true, title: true },
      }),
      this.prisma.keyResult.findMany({
        where: { id: { in: ids('KeyResult') } },
        select: { id: true, title: true },
      }),
    ]);
    const map = new Map<string, string>();
    users.forEach((x) => map.set(`User:${x.id}`, x.name));
    teams.forEach((x) => map.set(`Team:${x.id}`, x.name));
    cycles.forEach((x) => map.set(`Cycle:${x.id}`, x.name));
    objectives.forEach((x) => map.set(`Objective:${x.id}`, x.title));
    krs.forEach((x) => map.set(`KeyResult:${x.id}`, x.title));
    return map;
  }
}

/** "Integrante → Líder" para un cambio de rol; null para el resto. */
function roleChange(action: string, before: unknown, after: unknown): string | null {
  if (action !== 'USER_ROLE_CHANGED') return null;
  const b = (before as { role?: string } | null)?.role;
  const a = (after as { role?: string } | null)?.role;
  return b && a ? `${ROLE_LABEL[b] ?? b} → ${ROLE_LABEL[a] ?? a}` : null;
}

/** Filtros de la pantalla de auditoría (acción, tipo de entidad, persona, desde, hasta). */
function auditQueryString(q: ResolvedAuditQuery): string {
  const params = new URLSearchParams();
  if (q.action) params.set('accion', q.action);
  if (q.entity) params.set('entidad', q.entity.entityType);
  if (q.actor) params.set('persona', q.actor.id);
  if (q.from) params.set('desde', day(q.from));
  if (q.to) params.set('hasta', day(q.to));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

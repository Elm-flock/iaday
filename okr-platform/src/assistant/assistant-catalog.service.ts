import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildCatalog, type BuiltCatalog } from './domain/catalog';

export interface CatalogContext extends BuiltCatalog {
  existingTeams: { name: string; parentId: string | null }[];
  /** Objetivos DRAFT+PUBLISHED por `${cycleId}|U|${userId}` / `${cycleId}|T|${teamId}`. */
  objectiveCounts: Record<string, number>;
  krCounts: Record<string, number>;
}

/** Lee la organización y arma el catálogo con handles (contrato §3.4) y los datos para validar el plan. */
@Injectable()
export class AssistantCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async build(): Promise<CatalogContext> {
    const [users, teams, cycles, objectives, keyResults] = await Promise.all([
      this.prisma.user.findMany({
        select: {
          id: true,
          name: true,
          role: true,
          active: true,
          memberships: { select: { teamId: true } },
        },
      }),
      this.prisma.team.findMany({
        select: {
          id: true,
          name: true,
          parentId: true,
          members: { select: { userId: true, isLead: true } },
        },
      }),
      this.prisma.cycle.findMany({
        select: {
          id: true,
          name: true,
          kind: true,
          status: true,
          parentId: true,
          startDate: true,
          endDate: true,
        },
      }),
      this.prisma.objective.findMany({
        where: { status: { in: ['DRAFT', 'PUBLISHED'] } },
        select: {
          id: true,
          title: true,
          cycleId: true,
          ownerUserId: true,
          ownerTeamId: true,
          status: true,
          _count: { select: { keyResults: true } },
        },
      }),
      this.prisma.keyResult.findMany({
        where: { objective: { status: { in: ['DRAFT', 'PUBLISHED'] } } },
        select: { id: true, objectiveId: true, title: true, ownerId: true },
      }),
    ]);

    const built = buildCatalog({
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        active: u.active,
        teamIds: u.memberships.map((m) => m.teamId),
      })),
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        parentId: t.parentId,
        leadIds: t.members.filter((m) => m.isLead).map((m) => m.userId),
        memberCount: t.members.length,
      })),
      cycles,
      objectives: objectives.map((o) => ({
        id: o.id,
        title: o.title,
        cycleId: o.cycleId,
        ownerUserId: o.ownerUserId,
        ownerTeamId: o.ownerTeamId,
        status: o.status,
        krCount: o._count.keyResults,
      })),
      keyResults,
    });

    const objectiveCounts: Record<string, number> = {};
    const krCounts: Record<string, number> = {};
    for (const o of objectives) {
      const owner = o.ownerUserId ? `U|${o.ownerUserId}` : `T|${o.ownerTeamId}`;
      const key = `${o.cycleId}|${owner}`;
      objectiveCounts[key] = (objectiveCounts[key] ?? 0) + 1;
      krCounts[o.id] = o._count.keyResults;
    }
    return {
      ...built,
      existingTeams: teams.map((t) => ({ name: t.name, parentId: t.parentId })),
      objectiveCounts,
      krCounts,
    };
  }

  /** Emails (minúsculas) que ya existen entre los candidatos: no viajan al agente, solo validan el plan. */
  async takenEmails(candidates: string[]): Promise<Set<string>> {
    if (candidates.length === 0) return new Set();
    const rows = await this.prisma.user.findMany({
      where: { email: { in: candidates.map((e) => e.toLowerCase()) } },
      select: { email: true },
    });
    return new Set(rows.map((r) => r.email.toLowerCase()));
  }
}

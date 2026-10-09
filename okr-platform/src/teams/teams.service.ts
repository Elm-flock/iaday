import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { originMix } from '../okrs/domain/origin-mix';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTeamDto,
  TeamDetailDto,
  TeamDto,
  TeamMemberDto,
  TeamNodeDto,
  UpdateTeamDto,
} from './dto/team.dto';
import { validateTeamMove } from './domain/team-tree';

const TEAM_SELECT = { id: true, name: true, parentId: true } as const;

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Árbol completo anidado (hijos ordenados por nombre). La raíz es única: la organización. */
  async tree(): Promise<TeamNodeDto[]> {
    const teams = await this.prisma.team.findMany({
      select: TEAM_SELECT,
      orderBy: { name: 'asc' },
    });
    const nodes = new Map<string, TeamNodeDto>(teams.map((t) => [t.id, { ...t, children: [] }]));
    const roots: TeamNodeDto[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId ? nodes.get(node.parentId) : undefined;
      (parent ? parent.children : roots).push(node);
    }
    return roots;
  }

  async detail(id: string, cycleId?: string): Promise<TeamDetailDto> {
    const team = await this.prisma.team.findUnique({
      where: { id },
      select: {
        ...TEAM_SELECT,
        members: {
          select: { userId: true, isLead: true, user: { select: { name: true } } },
          orderBy: [{ isLead: 'desc' }, { user: { name: 'asc' } }],
        },
      },
    });
    if (!team) throw new NotFoundException('Equipo no encontrado');

    let mix: TeamDetailDto['originMix'] = null;
    if (cycleId) {
      const cycle = await this.prisma.cycle.findUnique({
        where: { id: cycleId },
        select: { id: true },
      });
      if (!cycle) throw new NotFoundException('Ciclo no encontrado');
      // Indicador del equipo: sus objetivos propios (ownerTeamId) en el ciclo. Es blando, nunca bloquea.
      const objectives = await this.prisma.objective.findMany({
        where: { cycleId, ownerTeamId: id },
        select: { origin: true },
      });
      mix = originMix(objectives);
    }

    return {
      id: team.id,
      name: team.name,
      parentId: team.parentId,
      members: team.members.map((m) => ({ userId: m.userId, name: m.user.name, isLead: m.isLead })),
      originMix: mix,
    };
  }

  async create(dto: CreateTeamDto): Promise<TeamDto> {
    if (dto.parentId) await this.requireTeam(dto.parentId, 'Equipo padre no encontrado');
    // Raíz duplicada / nombre repetido bajo el mismo padre: los índices únicos -> 409 (PrismaExceptionFilter).
    return this.prisma.team.create({
      data: { name: dto.name, parentId: dto.parentId ?? null },
      select: TEAM_SELECT,
    });
  }

  async update(id: string, dto: UpdateTeamDto): Promise<TeamDto> {
    await this.requireTeam(id, 'Equipo no encontrado');
    if (dto.parentId) {
      await this.requireTeam(dto.parentId, 'Equipo padre no encontrado');
      const all = await this.prisma.team.findMany({ select: { id: true, parentId: true } });
      const verdict = validateTeamMove(
        id,
        dto.parentId,
        new Map(all.map((t) => [t.id, t.parentId])),
      );
      if (!verdict.ok) throw new ConflictException(verdict.message);
    }
    return this.prisma.team.update({
      where: { id },
      data: { name: dto.name, parentId: dto.parentId },
      select: TEAM_SELECT,
    });
  }

  async setMember(teamId: string, userId: string, isLead = false): Promise<TeamMemberDto> {
    await this.requireTeam(teamId, 'Equipo no encontrado');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const member = await this.prisma.teamMember.upsert({
      where: { userId_teamId: { userId, teamId } },
      create: { userId, teamId, isLead },
      update: { isLead },
      select: { isLead: true },
    });
    return { userId, name: user.name, isLead: member.isLead };
  }

  async removeMember(teamId: string, userId: string): Promise<void> {
    // P2025 (no es miembro) -> 404 vía PrismaExceptionFilter.
    await this.prisma.teamMember.delete({ where: { userId_teamId: { userId, teamId } } });
  }

  private async requireTeam(id: string, message: string): Promise<void> {
    const found = await this.prisma.team.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException(message);
  }
}

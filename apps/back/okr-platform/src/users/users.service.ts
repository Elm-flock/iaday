import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import argon2 from 'argon2';
import type { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { generateInitialPassword } from '../assistant/domain/password';
import { CreatedUserDto, CreateUserDto, UpdateUserDto, UserDto } from './dto/user.dto';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<UserDto[]> {
    return this.prisma.user.findMany({ select: USER_SELECT, orderBy: { name: 'asc' } });
  }

  /**
   * Alta por administración (UI o asistente). La cuenta nace con `mustChangePassword`: otra persona conoce
   * la clave inicial, así que solo puede cambiarla hasta que la reemplace. Sin `password` en el pedido se
   * genera una aleatoria que se devuelve UNA vez; jamás se guarda en claro, se loguea ni se audita.
   */
  async create(dto: CreateUserDto): Promise<CreatedUserDto> {
    const generated = dto.password === undefined;
    const password = dto.password ?? generateInitialPassword();
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name,
        passwordHash: await argon2.hash(password),
        role: dto.role ?? 'MEMBER',
        mustChangePassword: true,
      },
      // El directorio (GET /users) no expone mustChangePassword: lo ve solo quien da el alta.
      select: { ...USER_SELECT, mustChangePassword: true },
    });
    return generated ? { ...user, initialPassword: password } : user;
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto): Promise<UserDto> {
    const current = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!current) throw new NotFoundException('Usuario no encontrado');

    const roleChanged = dto.role !== undefined && dto.role !== current.role;
    const deactivated = dto.active === false && current.active;
    // Evita que el único ADMIN se bloquee a sí mismo.
    if (actor.id === id && (roleChanged || dto.active === false)) {
      throw new UnprocessableEntityException(
        'Un administrador no puede cambiar su propio rol ni desactivarse',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { name: dto.name, role: dto.role, active: dto.active },
        select: USER_SELECT,
      });
      if (roleChanged) {
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'USER_ROLE_CHANGED',
            entityType: 'User',
            entityId: id,
            before: { role: current.role },
            after: { role: updated.role },
          },
        });
      }
      if (deactivated) {
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'USER_DEACTIVATED',
            entityType: 'User',
            entityId: id,
            before: { active: true },
            after: { active: false },
          },
        });
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return updated;
    });
  }

  async resetPassword(id: string, password: string): Promise<void> {
    const exists = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Usuario no encontrado');
    const passwordHash = await argon2.hash(password);
    await this.prisma.$transaction([
      // La clave nueva la conoce administración: la persona debe cambiarla al entrar.
      this.prisma.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
}

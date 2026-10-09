import { randomUUID } from 'crypto';
import {
  CycleKind,
  ObjectiveOrigin,
  ObjectiveType,
  PrismaClient,
  Role,
} from '../../generated/prisma/client';

/**
 * Factories mínimas para e2e. Cada una acepta `overrides` y devuelve la fila creada.
 * El passwordHash por defecto NO es un hash válido: los tests de login deben crear
 * el usuario con un hash argon2 real (ver `createUser` con `passwordHash`).
 */
let counter = 0;
const next = () => ++counter;

export function createUser(
  prisma: PrismaClient,
  overrides: Partial<{
    email: string;
    name: string;
    passwordHash: string;
    role: Role;
    active: boolean;
  }> = {},
) {
  const n = next();
  return prisma.user.create({
    data: {
      email: `user${n}@test.local`,
      name: `Usuario ${n}`,
      passwordHash: 'hash-invalido-de-prueba',
      role: 'MEMBER',
      ...overrides,
    },
  });
}

export function createTeam(
  prisma: PrismaClient,
  overrides: Partial<{ name: string; parentId: string | null }> = {},
) {
  return prisma.team.create({
    data: { name: `Equipo ${next()}`, parentId: null, ...overrides },
  });
}

export function createCycle(
  prisma: PrismaClient,
  overrides: Partial<{
    name: string;
    kind: CycleKind;
    parentId: string | null;
    startDate: Date;
    endDate: Date;
  }> = {},
) {
  return prisma.cycle.create({
    data: {
      name: `Ciclo ${next()}`,
      kind: 'ANNUAL',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      ...overrides,
    },
  });
}

export function createObjective(
  prisma: PrismaClient,
  data: {
    cycleId: string;
    createdById: string;
    ownerUserId?: string | null;
    ownerTeamId?: string | null;
    title?: string;
    origin?: ObjectiveOrigin;
    type?: ObjectiveType;
  },
) {
  return prisma.objective.create({
    data: {
      title: `Objetivo ${next()}`,
      origin: 'TOP_DOWN',
      type: 'COMMITTED',
      ...data,
    },
  });
}

export function createKeyResult(
  prisma: PrismaClient,
  data: {
    objectiveId: string;
    ownerId: string;
    startValue?: number;
    targetValue?: number;
    position?: number;
  },
) {
  return prisma.keyResult.create({
    data: {
      title: `KR ${next()}`,
      scoring: 'DERIVED',
      startValue: 0,
      targetValue: 100,
      position: 1,
      ...data,
    },
  });
}

export const uuid = () => randomUUID();

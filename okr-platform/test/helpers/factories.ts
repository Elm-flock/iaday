import argon2 from 'argon2';
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
 * El usuario se crea con un hash argon2 REAL de `DEFAULT_PASSWORD` (calculado una sola vez),
 * de modo que sirve directamente para los tests de login.
 */
let counter = 0;
const next = () => ++counter;

export const DEFAULT_PASSWORD = 'Password123!';
let defaultHash: Promise<string> | undefined;
const getDefaultHash = () => (defaultHash ??= argon2.hash(DEFAULT_PASSWORD));

export async function createUser(
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
      passwordHash: await getDefaultHash(),
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

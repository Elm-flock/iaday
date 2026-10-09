import { PrismaClient } from '../generated/prisma/client';
import { truncateAll } from './helpers/db';
import { createCycle, createTeam, createUser, uuid } from './helpers/factories';

/** Extrae el SQLSTATE de un error de Prisma por query raw (P2010 -> meta.code). */
async function sqlState(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error: any) {
    return error?.meta?.code ?? error?.code;
  }
}

describe('Constraints manuales de BD (migración 0001_init)', () => {
  const prisma = new PrismaClient();

  beforeEach(() => truncateAll(prisma));
  afterAll(() => prisma.$disconnect());

  it('REQ-OKR-1: objetivo con ownerUser Y ownerTeam -> 23514', async () => {
    const user = await createUser(prisma);
    const team = await createTeam(prisma);
    const cycle = await createCycle(prisma);

    const code = await sqlState(
      prisma.$executeRaw`INSERT INTO "Objective"
        ("id","cycleId","ownerUserId","ownerTeamId","title","origin","type","createdById","updatedAt")
        VALUES (${uuid()}::uuid, ${cycle.id}::uuid, ${user.id}::uuid, ${team.id}::uuid,
                't', 'TOP_DOWN', 'COMMITTED', ${user.id}::uuid, now())`,
    );
    expect(code).toBe('23514');
  });

  it('REQ-OKR-1: objetivo sin owner -> 23514', async () => {
    const user = await createUser(prisma);
    const cycle = await createCycle(prisma);

    const code = await sqlState(
      prisma.$executeRaw`INSERT INTO "Objective"
        ("id","cycleId","title","origin","type","createdById","updatedAt")
        VALUES (${uuid()}::uuid, ${cycle.id}::uuid, 't', 'TOP_DOWN', 'COMMITTED',
                ${user.id}::uuid, now())`,
    );
    expect(code).toBe('23514');
  });

  it('REQ-CYC-1: ciclo con start >= end -> 23514', async () => {
    const code = await sqlState(
      prisma.$executeRaw`INSERT INTO "Cycle" ("id","name","kind","startDate","endDate","updatedAt")
        VALUES (${uuid()}::uuid, 'invalido', 'ANNUAL', '2026-12-31'::date, '2026-01-01'::date, now())`,
    );
    expect(code).toBe('23514');
  });

  it('REQ-CYC-2: umbral fuera de (0,1] -> 23514', async () => {
    const code = await sqlState(
      createCycle(prisma).then(
        (c) =>
          prisma.$executeRaw`UPDATE "Cycle" SET "committedThreshold" = 1.2 WHERE id = ${c.id}::uuid`,
      ),
    );
    expect(code).toBe('23514');
  });

  it('un segundo equipo raiz viola team_single_root (23505)', async () => {
    await createTeam(prisma, { name: 'Org' });
    const code = await sqlState(
      prisma.$executeRaw`INSERT INTO "Team" ("id","name","updatedAt")
        VALUES (${uuid()}::uuid, 'Otra raiz', now())`,
    );
    expect(code).toBe('23505');
  });

  it('feedback a si mismo -> 23514', async () => {
    const user = await createUser(prisma);
    const code = await sqlState(
      prisma.$executeRaw`INSERT INTO "Feedback" ("id","fromUserId","toUserId","content","updatedAt")
        VALUES (${uuid()}::uuid, ${user.id}::uuid, ${user.id}::uuid, 'x', now())`,
    );
    expect(code).toBe('23514');
  });
});

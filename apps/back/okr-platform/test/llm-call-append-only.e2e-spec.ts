import { PrismaService } from '../src/prisma/prisma.service';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './helpers/app';
import { truncateAll } from './helpers/db';
import { createUser, uuid } from './helpers/factories';

/** SQLSTATE de un error de Prisma por query raw (P2010 -> meta.code). */
async function sqlState(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error: any) {
    return error?.meta?.code ?? error?.code;
  }
}

describe('LlmCall append-only (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll(prisma);
  });

  const insert = (actorId: string | null) =>
    prisma.llmCall.create({
      data: {
        traceId: uuid(),
        feature: 'ADAPT',
        step: 'GENERATE',
        model: 'm',
        promptId: 'easy_read',
        promptVersion: '1',
        promptHash: 'abc',
        inputTokens: 10,
        outputTokens: 5,
        latencyMs: 100,
        costUsdEst: 0.0001,
        status: 'OK',
        actorId,
      },
    });

  it('permite INSERT', async () => {
    const row = await insert(null);
    expect(await prisma.llmCall.count({ where: { id: row.id } })).toBe(1);
  });

  it('rechaza UPDATE de cualquier columna (restrict_violation 23001)', async () => {
    const row = await insert(null);
    expect(
      await sqlState(
        prisma.$executeRaw`UPDATE "LlmCall" SET "inputTokens" = 999 WHERE id = ${row.id}::uuid`,
      ),
    ).toBe('23001');
    await expect(
      prisma.llmCall.update({ where: { id: row.id }, data: { status: 'FAILED' } }),
    ).rejects.toThrow(/append-only/);
    expect((await prisma.llmCall.findUniqueOrThrow({ where: { id: row.id } })).inputTokens).toBe(
      10,
    );
  });

  it('rechaza DELETE', async () => {
    const row = await insert(null);
    expect(
      await sqlState(prisma.$executeRaw`DELETE FROM "LlmCall" WHERE id = ${row.id}::uuid`),
    ).toBe('23001');
    expect(await prisma.llmCall.count()).toBe(1);
  });

  it('rechaza poner actorId en una fila anónima o cambiarlo por otro usuario', async () => {
    const user = await createUser(prisma);
    const other = await createUser(prisma);
    const anon = await insert(null);
    expect(
      await sqlState(
        prisma.$executeRaw`UPDATE "LlmCall" SET "actorId" = ${user.id}::uuid WHERE id = ${anon.id}::uuid`,
      ),
    ).toBe('23001');
    const owned = await insert(user.id);
    expect(
      await sqlState(
        prisma.$executeRaw`UPDATE "LlmCall" SET "actorId" = ${other.id}::uuid WHERE id = ${owned.id}::uuid`,
      ),
    ).toBe('23001');
  });

  it('permite la única mutación de la FK: borrar al usuario deja actorId en NULL y conserva la fila', async () => {
    const user = await createUser(prisma);
    const row = await insert(user.id);
    await prisma.user.delete({ where: { id: user.id } });
    const after = await prisma.llmCall.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.actorId).toBeNull();
    expect(after.inputTokens).toBe(10);
  });

  it('rechaza TRUNCATE (trigger de sentencia, restrict_violation 23001)', async () => {
    await insert(null);
    expect(await sqlState(prisma.$executeRawUnsafe('TRUNCATE TABLE "LlmCall"'))).toBe('23001');
    expect(await sqlState(prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE'))).toBe('23001');
    expect(await prisma.llmCall.count()).toBe(1);
  });

  it('truncateAll de tests puede vaciar la tabla (replica role, solo en tests)', async () => {
    await insert(null);
    await truncateAll(prisma);
    expect(await prisma.llmCall.count()).toBe(0);
  });
});

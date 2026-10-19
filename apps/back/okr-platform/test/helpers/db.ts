import { PrismaClient } from '../../generated/prisma/client';

/**
 * Trunca TODAS las tablas de negocio (excepto _prisma_migrations) entre suites.
 *
 * "AuditLog" y "LlmCall" tienen un trigger BEFORE TRUNCATE que rechaza el vaciado (append-only).
 * Solo para tests se desactivan los triggers de usuario en ESTA transaccion con
 * `SET LOCAL session_replication_role = replica` (requiere superusuario; la BD de test usa
 * `postgres`). El comportamiento de produccion no cambia: el trigger sigue activo.
 */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$transaction([
    prisma.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`),
    prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`),
  ]);
}

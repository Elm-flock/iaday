/**
 * Seed idempotente: crea el usuario ADMIN inicial y el equipo raíz (la organización).
 * Credenciales SOLO desde el entorno (no hay valores por defecto):
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, [SEED_ADMIN_NAME], [SEED_ORG_NAME]
 * Uso: npx prisma db seed
 */
import * as argon2 from 'argon2';
import { PrismaClient } from '../generated/prisma/client';

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name} para ejecutar el seed.`);
  }
  return value;
}

async function main(): Promise<void> {
  const email = requireEnv('SEED_ADMIN_EMAIL').toLowerCase();
  const password = requireEnv('SEED_ADMIN_PASSWORD');
  if (password.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 12 caracteres.');
  }
  const name = process.env.SEED_ADMIN_NAME ?? 'Administrador';
  const orgName = process.env.SEED_ORG_NAME ?? 'Organización';

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  // Idempotente: si el admin ya existe no se pisa su contraseña.
  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, passwordHash, role: 'ADMIN' },
  });

  // Raíz única del árbol de equipos (índice parcial team_single_root).
  const existingRoot = await prisma.team.findFirst({ where: { parentId: null } });
  if (!existingRoot) {
    await prisma.team.create({ data: { name: orgName } });
  }

  console.log(`Seed OK: admin ${admin.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

import { defineConfig } from 'prisma/config';

// Con prisma.config.ts, Prisma deja de cargar `.env` automáticamente: se hace acá.
// No pisa variables ya definidas (CI, .env.test cargado por el runner, etc.).
try {
  process.loadEnvFile('.env');
} catch {
  // Sin .env: se asume que el entorno ya define DATABASE_URL.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
});

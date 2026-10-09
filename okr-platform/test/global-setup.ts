import { execSync } from 'child_process';
import { join } from 'path';
import { loadTestEnv } from './load-env';

/**
 * globalSetup e2e: aplica las migraciones pendientes sobre la BD de test.
 *
 * No borra el schema: la BD de test es efímera (tmpfs en docker-compose) y `migrate deploy` es
 * idempotente. El aislamiento entre tests se hace vaciando tablas con `truncateAll` (helpers/db.ts).
 * Protección: se niega a operar si la URL no apunta a una BD de test.
 */
export default function globalSetup(): void {
  loadTestEnv();
  const url = process.env.DATABASE_URL;
  if (!url || !/test/i.test(new URL(url).pathname)) {
    throw new Error(
      'DATABASE_URL no apunta a una base de test (el nombre debe contener "test"). Abortando.',
    );
  }

  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}

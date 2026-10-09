import { execSync } from 'child_process';
import { join } from 'path';
import { loadTestEnv } from './load-env';

/**
 * globalSetup e2e: deja la BD de test en estado limpio y con todas las migraciones aplicadas.
 *
 * Se recrea el schema `public` y se corre `prisma migrate deploy` (equivale a un reset, pero sin
 * depender de `migrate reset`, que Prisma bloquea cuando lo ejecuta un agente de IA).
 * Protección: se niega a operar si la URL no apunta a una BD de test.
 */
export default function globalSetup(): void {
  loadTestEnv();
  const url = process.env.DATABASE_URL;
  if (!url || !/test/i.test(new URL(url).pathname)) {
    throw new Error(
      'DATABASE_URL no apunta a una base de test (el nombre debe contener "test"). Abortando para no borrar datos reales.',
    );
  }

  const options = {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe' as const,
  };
  // Se usa la CLI (y no el cliente generado) porque globalSetup no aplica el moduleNameMapper de Jest.
  execSync('npx prisma db execute --stdin --schema prisma/schema.prisma', {
    ...options,
    input: 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;',
  });
  execSync('npx prisma migrate deploy', { ...options, stdio: 'inherit' });
}

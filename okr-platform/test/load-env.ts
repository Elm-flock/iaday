import { join } from 'path';

/**
 * Carga `.env.test` en process.env (Node >= 20.12). No pisa variables ya definidas
 * (por ejemplo, DATABASE_URL inyectada por CI).
 */
export function loadTestEnv(): void {
  try {
    process.loadEnvFile(join(__dirname, '..', '.env.test'));
  } catch {
    // Sin .env.test: se asume que el entorno ya define las variables.
  }
}

loadTestEnv();

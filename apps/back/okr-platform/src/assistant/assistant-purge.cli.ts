/**
 * `npm run assistant:purge`: borra mensajes (> 30 días) y planes (> 90 días) del asistente y marca como
 * interrumpidos los planes que quedaron EXECUTING. Pensado para un cron diario. Solo usa Prisma.
 */
import { PrismaClient } from '../../generated/prisma/client';
import { AssistantRetentionService } from './assistant-retention.service';

try {
  process.loadEnvFile('.env');
} catch {
  // Sin .env: se asume DATABASE_URL en el entorno.
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const now = new Date();
    const retention = new AssistantRetentionService(prisma as never);
    const swept = await retention.sweepInterrupted(now);
    const purged = await retention.purge(now);
    console.log(
      `assistant:purge -> ${purged.messages} mensajes, ${purged.plans} planes borrados; ${swept} planes interrumpidos`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();

import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { buildOpenApiConfig } from './configure-app';

/** Ruta del documento commiteado (raíz de la app, fuera de src/). */
export const OPENAPI_PATH = join(__dirname, '..', 'openapi.json');

/** Ordena claves recursivamente (los arrays conservan su orden) para diffs estables. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

/**
 * Construye el documento OpenAPI SIN base de datos.
 * NestFactory.create instancia los providers (PrismaClient no conecta en el constructor)
 * pero NO ejecuta onModuleInit: PrismaService.$connect solo corre en init()/listen(),
 * que acá nunca se invocan. Así el comportamiento en runtime queda intacto.
 */
export async function buildOpenApiDocument(): Promise<object> {
  // El factory de JwtModule exige el secreto al instanciar; el valor no se usa para firmar nada.
  process.env.JWT_ACCESS_SECRET ??= 'openapi-emit-placeholder';
  process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@localhost:5432/openapi';
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    return SwaggerModule.createDocument(app, buildOpenApiConfig());
  } finally {
    await app.close();
  }
}

/** Serialización canónica: claves ordenadas, 2 espacios y salto de línea final. */
export function serializeOpenApi(document: object): string {
  return JSON.stringify(sortKeys(document), null, 2) + '\n';
}

if (require.main === module) {
  void buildOpenApiDocument().then((doc) => {
    writeFileSync(OPENAPI_PATH, serializeOpenApi(doc), 'utf8');
    console.log(`openapi.json emitido en ${OPENAPI_PATH}`);
  });
}

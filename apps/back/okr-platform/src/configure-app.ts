import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

/**
 * Opciones del ValidationPipe global. Se exportan para que el asistente (ejecución en proceso) valide
 * cada acción con EXACTAMENTE las mismas reglas que la capa HTTP.
 */
export const VALIDATION_PIPE_OPTIONS = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;

/** Configuración compartida entre main.ts y los tests e2e. */
export function configureApp(app: INestApplication): void {
  app.use(helmet());
  app.enableCors({ origin: process.env.FRONT_ORIGIN });
  app.useGlobalPipes(new ValidationPipe({ ...VALIDATION_PIPE_OPTIONS }));

  SwaggerModule.setup('api', app, SwaggerModule.createDocument(app, buildOpenApiConfig()));
}

/** Config base del documento OpenAPI; compartida con el emisor (src/openapi.ts). */
export function buildOpenApiConfig() {
  return new DocumentBuilder()
    .setTitle('okr-platform API')
    .setDescription('Documentación de la API de okr-platform')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();
}

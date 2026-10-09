import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

/** Configuración compartida entre main.ts y los tests e2e. */
export function configureApp(app: INestApplication): void {
  app.use(helmet());
  app.enableCors({ origin: process.env.FRONT_ORIGIN });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

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

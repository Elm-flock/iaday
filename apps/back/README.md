# OKR Platform - Back

API REST de la plataforma de gestión de OKRs: ciclos, objetivos y resultados clave, check-ins con score, CFR (feedback privado y reconocimientos), auditoría y reporte de equipo por ciclo.

## Stack

NestJS 11, TypeScript, Prisma 6 y PostgreSQL 15. Auth con JWT de acceso y refresh tokens con rotación. Swagger en `/api`. Tests con Jest y supertest.

## Estructura

- `okr-platform/`: la aplicación (código en `src/`, esquema y migraciones en `prisma/`, tests e2e en `test/`, contrato en `openapi.json`).
- `docs/arquitectura.md`: arquitectura, autenticación y autorización, modelo de datos y reglas de dominio.
- `docker-compose.yml`: PostgreSQL de desarrollo (`db`, puerto 5432) y efímero para e2e (`db-test`, puerto 55433).

## Puesta en marcha

Desde la raíz del repo:

```bash
docker compose up -d db
npm install
```

Desde `okr-platform/`:

```bash
cp .env.example .env        # completar JWT_ACCESS_SECRET, SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD
npm install
npx prisma generate
npx prisma migrate deploy
npx prisma db seed          # crea el admin inicial y el equipo raíz
npm run start:dev
```

Swagger queda en `http://localhost:<PORT>/api`.

## Tests

Desde `okr-platform/`:

- `npm test`: unitarios (con foco en `domain/`; Jest exige 90 % de cobertura ahí).
- `npm run test:cov`: unitarios con cobertura.
- `npm run test:e2e`: e2e; requiere `docker compose up -d db-test` y usa `.env.test`.
- `npm run openapi:emit`: regenera `openapi.json` tras cambiar endpoints o DTOs.

## Más información

- [Arquitectura](docs/arquitectura.md)
- Demo local completa (API y front con datos de ejemplo): `tools/demo` en el monorepo `okr-platform-monorepo`.

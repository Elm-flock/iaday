# OKR Platform - Back

API REST de la plataforma de gestión de OKRs: ciclos, objetivos y resultados clave, check-ins con score, CFR (feedback privado y reconocimientos), auditoría y reporte de equipo por ciclo.

También expone la IA del producto, que genera el agente Python (`okr-platform-agent`) y que esta API controla:

- `src/ai`: versiones en lectura fácil y lenguaje claro, sugerencia de OKRs, resumen de check-ins, validación por una persona y métricas de uso e impacto (`/ai/usage`, `/ai/impact`).
- `src/assistant`: asistente de administración. Novedades, consultas de auditoría, ayuda sobre los manuales y planes que se confirman con hash y se ejecutan como el admin.
- `src/adaptation-requests`: pedidos de documentos adaptados a una persona (art. 14.5 del RD 707/2026).
- Cada llamada al modelo queda en `LlmCall` (append-only, con tokens y costo estimado). Toda alta de usuario obliga a cambiar la contraseña en el primer ingreso.

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

### IA (opcional)

Con `AI_ENABLED=false` (default) la API funciona igual y las rutas de IA responden 503. Para activarla, levantar el agente (`okr-platform-agent`, ver su README) y completar en `.env`:

| Variable                           | Para qué                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `AI_ENABLED` / `ASSISTANT_ENABLED` | Activan la IA y el asistente de administración                                            |
| `AGENT_URL`                        | URL del agente (por ejemplo `http://127.0.0.1:8088`)                                      |
| `AGENT_SHARED_SECRET`              | Secreto HMAC, el mismo valor que en el agente (32+ bytes aleatorios)                      |
| `AGENT_TIMEOUT_MS`                 | Espera máxima por pedido (default 125000; tiene que ser mayor que el deadline del agente) |

El resto (throttle, retención, TTL de planes) está en `.env.example`. Después de cambiar los manuales del front, correr `npm run assistant:help-index` para copiar el índice de ayuda.

## Tests

Desde `okr-platform/`:

- `npm test`: unitarios (con foco en `domain/`; Jest exige 90 % de cobertura ahí).
- `npm run test:cov`: unitarios con cobertura.
- `npm run test:e2e`: e2e; requiere `docker compose up -d db-test` y usa `.env.test`.
- `npm run openapi:emit`: regenera `openapi.json` tras cambiar endpoints o DTOs.

## Más información

- [Arquitectura](docs/arquitectura.md), incluida la sección de IA, el modelo de seguridad del asistente y el cumplimiento del RD 707/2026
- Contratos con el agente: `docs/ai/agent-contract.md` y `docs/ai/agent-contract-admin.md` en el monorepo
- Demo local completa (API y front con datos de ejemplo): `tools/demo` en el monorepo `okr-platform-monorepo`.

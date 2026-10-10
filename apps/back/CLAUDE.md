# CLAUDE.md

API REST de OKRs. App en `okr-platform/` (los comandos de npm se corren desde ahí). Detalle en `docs/arquitectura.md`.

## Stack

NestJS 11, TypeScript, Prisma 6 (cliente generado en `okr-platform/generated/`, no se versiona), PostgreSQL 15, Jest.

## Capas

- Controller: solo HTTP, DTOs con `class-validator` y Swagger. El `ValidationPipe` global usa whitelist.
- Service: orquesta Prisma, carga el actor y traduce errores de dominio a HTTP.
- `domain/`: funciones puras sin Nest ni Prisma, que devuelven `Result` (`ok` / `err(code, message)`). Cobertura mínima 90 % en `**/domain/**` (umbral de Jest).
- Errores de dominio con la forma `{ statusCode, message, code }` vía `okrDomainError`, `cycleDomainError`, `cfrDomainError` o `reportForbidden`.

## Autorización

- Roles globales `ADMIN`, `LEADER`, `MEMBER`; el liderazgo de un equipo lo da `TeamMember.isLead`, no el rol.
- Las reglas que dependen del recurso son funciones puras (`policies.ts`) que reciben un `Actor`; el actor se carga con `OkrsAccess.loadActor`. Reutilizar `leadsTeam` y compañía en vez de duplicar.
- Recursos que el actor no puede ver responden 404 (no 403) cuando revelar su existencia es un problema; el feedback no tiene bypass para ADMIN.

## Flujo de trabajo

- Tras cambiar endpoints o DTOs: `npm run openapi:emit` y commitear `openapi.json` (hay un test que falla si está desactualizado).
- Cambios de esquema: migración de Prisma en `prisma/migrations`.
- Tests: `npm test` (unitarios); `npm run test:e2e` con `docker compose up -d db-test`.
- Lint y formato con husky + lint-staged al commitear.

## Convenciones

- Commits convencionales en español (`feat(reports): ...`, `fix(cfr): ...`, `docs: ...`). Sin `Co-Authored-By` ni atribución de IA.
- Textos de cara al usuario (mensajes de error, Swagger, docs) en español rioplatense neutro.
- Sin rankings, comparativas entre personas ni datos de compensación en ningún endpoint.

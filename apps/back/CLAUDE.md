# CLAUDE.md

API REST de OKRs. App en `okr-platform/` (los comandos de npm se corren desde ahí). Detalle en `docs/arquitectura.md`.

## Stack

NestJS 11, TypeScript, Prisma 6 (cliente generado en `okr-platform/generated/`, no se versiona), PostgreSQL 15, Jest.

## Capas

- Controller: solo HTTP, DTOs con `class-validator` y Swagger. El `ValidationPipe` global usa whitelist.
- Service: orquesta Prisma, carga el actor y traduce errores de dominio a HTTP.
- `domain/`: funciones puras sin Nest ni Prisma, que devuelven `Result` (`ok` / `err(code, message)`). Cobertura mínima 90 % en `**/domain/**` (umbral de Jest).
- Errores de dominio con la forma `{ statusCode, message, code }` vía `okrDomainError`, `cycleDomainError`, `cfrDomainError`, `aiDomainError` o `reportForbidden`.

## Autorización

- Roles globales `ADMIN`, `LEADER`, `MEMBER`; el liderazgo de un equipo lo da `TeamMember.isLead`, no el rol.
- Las reglas que dependen del recurso son funciones puras (`policies.ts`) que reciben un `Actor`; el actor se carga con `OkrsAccess.loadActor`. Reutilizar `leadsTeam` y compañía en vez de duplicar.
- Recursos que el actor no puede ver responden 404 (no 403) cuando revelar su existencia es un problema; el feedback no tiene bypass para ADMIN.

## IA (`src/ai`)

- El agente Python (`okr-platform-agent`) solo genera; esta API decide permisos, minimiza datos (nunca nombres, emails ni IDs) y es la única que escribe. Contrato en `docs/ai/agent-contract.md` del monorepo; fixtures en `okr-platform/test/fixtures/agent/`.
- Cada intento de LLM se guarda en `LlmCall` (append-only por trigger), también si el agente falla. Nada de contenido de feedback en `AuditLog`.
- Caché de adaptaciones: la clave es solo el texto fuente. `VALIDATED`/`ACCEPTED` se sirven siempre; `DRAFT`/`NEEDS_REVIEW` se regeneran en el lugar si su prompt (`promptId`+`promptVersion`) difiere del vigente que informa `GET /health` del agente (`domain/adaptation-cache.ts`). No hardcodear versiones de prompt.
- Con `AI_ENABLED=false` o agente caído responde 503 (`AI_DISABLED` / `AI_UNAVAILABLE`) y el resto de la API sigue igual. Los e2e levantan un stub del agente (`test/helpers/agent-stub.ts`).

## Pedidos de documento adaptado (`src/adaptation-requests`)

- Art. 14.5 del RD 707/2026 con una persona (no solo IA): `POST /adaptation-requests`, `GET /mine`, `GET /:id` (dueño o ADMIN; el resto 404), y solo ADMIN: listar con `?status=&overdue=`, `PATCH /:id/assign`, `POST /:id/deliver`, `POST /:id/reject`. Plazo `ADAPTATION_DUE_DAYS` (default 10).
- Transiciones puras en `domain/transitions.ts`; rechazar sin justificación (mín. 20) es 422 `ADAPTATION_REJECTION_JUSTIFICATION_REQUIRED`; `ENTREGADA` y `RECHAZADA` son terminales (409).
- Un feedback solo se vincula si la persona es emisor o receptor (sin bypass de ADMIN); ADMIN recibe `entityId: null` de ese vínculo. El AuditLog (`ADAPTATION_REQUEST_*`) guarda solo ids y estado, nunca texto libre.
- Validar una versión de IA: ADMIN o `isLead` (equipo dueño, o algún equipo de la dueña individual); la dueña de un objetivo individual no se autovalida salvo ADMIN (`ai/domain/access.ts`).

## Asistente de administración (`src/assistant`)

- Solo ADMIN (`AssistantAdminGuard`: el resto 404). El agente propone planes; Nest los valida (whitelist, handles opacos, anclaje `sourceQuote`, límites, DTO real), pide confirmación con `planHash` + vencimiento de 15 min y los ejecuta **en proceso** con los servicios existentes y el ADMIN como actor (relee rol y `active` al confirmar). Se frena en el primer fallo, sin rollback. Contrato: `docs/ai/agent-contract-admin.md`.
- Whitelist v1: crear usuario/equipo/ciclo/objetivo/KR, miembros y líder, activar ciclo, cambiar responsable de KR. Las solicitudes de adaptación solo se consultan (nunca se asignan, entregan ni rechazan por asistente). Los registros de una consulta nunca vuelven al LLM.
- La clave inicial de un alta va en `oneTimeSecret`, una sola vez; nunca en plan, mensajes, `AuditLog` ni logs. Todo alta por administración nace con `mustChangePassword` (403 `PASSWORD_CHANGE_REQUIRED` hasta `POST /auth/change-password`).
- Retención: mensajes 30 días, planes 90 (purga perezosa + `npm run assistant:purge`). `ASSISTANT_ENABLED`, `ASSISTANT_PLAN_TTL_MIN`, `ASSISTANT_AGENT_TIMEOUT_MS`.
- Ayuda: `src/assistant/help/help-index.json` es una **copia** del índice que emite el front (`npm run assistant:help-index`); no se regenera acá. Al agente viajan ids ASCII (`wireId`) y las citas se traducen de vuelta.
- Nuevos `AuditAction`: `ASSISTANT_*` y `USER_PASSWORD_CHANGED` (mantener `AUDIT_ACTIONS` sincronizado con el enum).

## Flujo de trabajo

- Tras cambiar endpoints o DTOs: `npm run openapi:emit` y commitear `openapi.json` (hay un test que falla si está desactualizado).
- Cambios de esquema: migración de Prisma en `prisma/migrations`.
- Tests: `npm test` (unitarios); `npm run test:e2e` con `docker compose up -d db-test`.
- Lint y formato con husky + lint-staged al commitear.

## Convenciones

- Commits convencionales en español (`feat(reports): ...`, `fix(cfr): ...`, `docs: ...`). Sin `Co-Authored-By` ni atribución de IA.
- Textos de cara al usuario (mensajes de error, Swagger, docs) en español rioplatense neutro.
- Sin rankings, comparativas entre personas ni datos de compensación en ningún endpoint.

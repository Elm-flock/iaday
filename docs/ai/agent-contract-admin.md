# Contrato HTTP NestJS ⇄ okr-platform-agent — Extensión "asistente admin y ayuda" (v1)

> **Extensión** de [`agent-contract.md`](./agent-contract.md) (v1). No cambia ninguna forma existente: agrega **paths nuevos** bajo `/v1/admin/*` y `/v1/help/*`. Todo lo que no se redefine acá (HMAC §3, `traceId` §3.1, `UsageStep` §4.1, `PromptRef` §4.5, envelope de error §5, límite de body, camelCase) **se hereda sin cambios**.
>
> Cambio SDD: `asistente-admin-y-manuales`. Versión de la extensión: **1**.

---

## 1. Principios (adicionales a los del contrato base)

1. **El agente propone, NestJS dispone.** El agente nunca ejecuta acciones, no tiene BD ni credenciales de servicio, y no recibe tokens de usuario. Devuelve un **plan** (datos puros) que NestJS valida contra su whitelist, muestra a la persona ADMIN y ejecuta **en proceso**, con esa persona como actor, solo después de una confirmación explícita (botón) con `planId` + `planHash`.
2. **Referencias opacas.** El agente nunca ve UUIDs. NestJS envía un **catálogo** con *handles* cortos (`U1`, `T3`, `C2`, `O7`, `K12`) y guarda server-side la tabla `handle → UUID` del pedido. Un plan que referencia un handle inexistente es inválido.
3. **Datos no confiables.** Todo texto que viene de la BD (nombres, títulos de objetivos/KRs, nombres de equipos o ciclos) viaja dentro de `catalog` y `facts`, y el agente lo trata como **dato, nunca como instrucción** (delimitado en el prompt). El contenido de **feedback nunca se envía** (ni texto, ni conteos por persona).
4. **Anclaje (grounding).** Cada acción del plan incluye `sourceQuote`: un fragmento literal de un mensaje **de la persona ADMIN** que la justifica. NestJS verifica que el fragmento exista (normalizado) en los mensajes de la persona del turno actual o los 3 anteriores. Una acción sin anclaje válido invalida el plan (defensa contra inyección desde datos del catálogo).
5. **PII.** El agente aplica su guard de PII (emails, DNI/NIE, teléfonos) a los mensajes de la persona antes de enviarlos a NVIDIA y **desenmascara** los valores en `plan.actions[*]` antes de responder. El catálogo no contiene emails.
6. **Nunca contraseñas.** El plan no tiene ningún campo de contraseña. NestJS genera la clave inicial al ejecutar `CREATE_USER`.

## 2. Endpoints nuevos

| Método | Path | Auth | Descripción | `AiFeature` (Nest) |
|---|---|---|---|---|
| `POST` | `/v1/admin/chat` | HMAC | Un turno del chat de administración: clasifica la intención y devuelve un plan de acciones, una respuesta de ayuda citando el manual, una pregunta aclaratoria o un "fuera de alcance" | `ADMIN_CHAT` |
| `POST` | `/v1/admin/digest-summary` | HMAC | Redacta en lenguaje claro el resumen de "novedades" a partir de hechos calculados por NestJS | `ADMIN_DIGEST` |
| `POST` | `/v1/help/answer` | HMAC | Responde una pregunta "¿cómo hago X?" usando solo los fragmentos del manual que envía NestJS (lo usa el chat y, opcionalmente, el buscador de `/ayuda`) | `HELP_ANSWER` |

`GET /health` agrega (campo opcional, compatible) `prompts[]` con los nuevos ids: `admin_classify`, `admin_planner`, `digest_summary`, `help_answer`.

### 2.1 Valores nuevos de `UsageStep.step` (solo en estos endpoints)

| `step` | Uso |
|---|---|
| `CLASSIFY` | Ya existe. Clasificación de intención del turno de chat (+ guard de inyección) |
| `PLAN` | **Nuevo.** Generación del plan |
| `ANSWER` | **Nuevo.** Respuesta de ayuda o pregunta aclaratoria |
| `SUMMARIZE` | **Nuevo.** Redacción del resumen de novedades |
| `REPAIR` | Ya existe. Reintento por JSON inválido / schema |

Los endpoints del contrato base **nunca** emiten `PLAN`, `ANSWER` ni `SUMMARIZE` (compatibilidad intacta). En Nest se agregan a `enum AiStep`.

## 3. Tipos comunes de la extensión

### 3.1 Handles

`Handle` = string con patrón `^[UTCOKR][0-9]{1,4}$`.

| Prefijo | Entidad |
|---|---|
| `U` | Usuario |
| `T` | Equipo |
| `C` | Ciclo |
| `O` | Objetivo |
| `K` | Resultado clave (KR) |
| `R` | Solicitud de documento adaptado (art. 14.5 RD 707/2026) — **depende del módulo `adaptation-requests`** |

Los handles son **por pedido** (NestJS los asigna en cada llamada y guarda el mapa junto al plan). No son estables entre turnos.

### 3.2 `EntityRef`

Una referencia a una entidad, existente o creada antes en el mismo plan:

```json
{ "kind": "EXISTING", "handle": "T3" }
{ "kind": "NEW", "ref": "t1" }
```

| Campo | Tipo | Reglas |
|---|---|---|
| `kind` | `"EXISTING" \| "NEW"` | |
| `handle` | `Handle` | Solo si `EXISTING`. Debe existir en el `catalog` del pedido y ser del tipo esperado por el campo |
| `ref` | `string` | Solo si `NEW`. Patrón `^[a-z][a-z0-9]{0,15}$`. Debe ser el `ref` de una acción **anterior** del mismo plan que crea una entidad del tipo esperado |

### 3.3 `ChatTurn`

| Campo | Tipo | Reglas |
|---|---|---|
| `role` | `"ADMIN" \| "ASSISTANT"` | |
| `text` | `string` | 1–2000 chars. Los turnos `ASSISTANT` son las respuestas de texto previas (nunca planes completos; un plan previo viaja resumido como `"[plan <estado>: <summary>]"`) |

### 3.4 `Catalog` (minimizado; solo lo necesario para resolver referencias)

| Campo | Tipo | Límite | Notas |
|---|---|---|---|
| `users` | `{ handle, name, role: "ADMIN"\|"LEADER"\|"MEMBER", active: boolean, teams: Handle[] }[]` | ≤ 500 | **Sin email.** Nombres duplicados se distinguen por handle; si hay ambigüedad el agente pregunta (`CLARIFY`) |
| `teams` | `{ handle, name, parent: Handle \| null, leads: Handle[], memberCount: int }[]` | ≤ 200 | |
| `cycles` | `{ handle, name, kind: "ANNUAL"\|"QUARTER", status: "DRAFT"\|"ACTIVE"\|"CLOSED", parent: Handle \| null, startDate, endDate }[]` | ≤ 50 | Fechas `YYYY-MM-DD` |
| `objectives` | `{ handle, title, cycle: Handle, ownerUser: Handle \| null, ownerTeam: Handle \| null, status: "DRAFT"\|"PUBLISHED", krCount: int }[]` | ≤ 300 | Solo ciclos `DRAFT`/`ACTIVE`. Sin descripción |
| `keyResults` | `{ handle, objective: Handle, title, owner: Handle }[]` | ≤ 600 | Solo de los objetivos incluidos |
| `adaptationRequests` | `{ handle, status: "PENDING"\|"IN_PROGRESS", entityKind: string, preferredFormat: string, dueDate: "YYYY-MM-DD", assignee: Handle \| null }[]` | ≤ 100 | Solo abiertas. **Sin persona solicitante ni texto del pedido** (puede revelar una discapacidad: dato de categoría especial, RGPD art. 9). Campos sujetos a los nombres finales del módulo `adaptation-requests` |

Si el catálogo real supera un límite, NestJS lo recorta priorizando ciclos `ACTIVE` y lo indica con `catalogTruncated: true`.

### 3.5 `HelpChunk`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `string` | Patrón `^(admin\|usuario)#[a-z0-9-]+$`: manual + **ancla estable del H3** de `okr-platform-front/docs/manuales/manual-{admin,usuario}.md` (un chunk = una tarea H3, con el H2 como contexto), p. ej. `admin#como-creo-un-usuario` |
| `manual` | `"ADMIN" \| "USUARIO"` | |
| `title` | `string` | Ruta de encabezados, p. ej. `"Usuarios > Crear un usuario"` |
| `text` | `string` | 1–3000 chars, Markdown plano sin imágenes |
| `url` | `string` | Ruta relativa en la app, p. ej. `/ayuda/administracion#como-creo-un-usuario` |

NestJS envía como máximo **6** fragmentos (top-k BM25), total ≤ 12000 chars.

## 4. Esquema del plan

### 4.1 `Plan`

| Campo | Tipo | Reglas |
|---|---|---|
| `summary` | `string` | 1–300 chars, lenguaje claro, voseo. Qué va a pasar en una oración |
| `actions` | `PlanAction[]` | 1–25 ítems, **en orden de ejecución** |
| `assumptions` | `string[]` | 0–5 ítems, ≤ 200 chars. Supuestos que la persona debe revisar (p. ej. "Usé el ciclo Q4 2026 porque es el único activo") |

### 4.2 `PlanAction` (unión discriminada por `type`)

Campos comunes a todas las acciones:

| Campo | Tipo | Reglas |
|---|---|---|
| `type` | ver tabla 4.3 | Whitelist cerrada. Cualquier otro valor → plan inválido |
| `sourceQuote` | `string` | 3–200 chars. Fragmento literal de un mensaje `ADMIN` (ver §1.4) |
| `ref` | `string` | **Obligatorio** en acciones que crean entidades (`CREATE_*`); prohibido en el resto. Único dentro del plan |

### 4.3 Whitelist v1 y mapeo a NestJS

| `type` | Campos propios | DTO Nest que valida | Servicio Nest que ejecuta | Crea |
|---|---|---|---|---|
| `CREATE_USER` | `ref`, `name` (1–120), `email` (email, ≤254), `role?` (`ADMIN`\|`LEADER`\|`MEMBER`, default `MEMBER`) | `CreateUserDto` (+ `password` generada por Nest) | `UsersService.create(dto)` | User |
| `CREATE_TEAM` | `ref`, `name` (1–120), `parent: EntityRef<Team>` | `CreateTeamDto` | `TeamsService.create(dto)` | Team |
| `SET_TEAM_MEMBER` | `team: EntityRef<Team>`, `user: EntityRef<User>`, `isLead: boolean` | `SetMemberDto` | `TeamsService.setMember(teamId, userId, isLead)` | — (alta o cambio de líder) |
| `REMOVE_TEAM_MEMBER` | `team: EntityRef<Team>`, `user: EntityRef<User>` (solo `EXISTING`) | — (ids validados) | `TeamsService.removeMember(teamId, userId)` | — |
| `CREATE_CYCLE` | `ref`, `name` (1–120), `kind`, `parent?: EntityRef<Cycle>` (solo `QUARTER`), `startDate`, `endDate` (`YYYY-MM-DD`), `checkInCadence?` (`WEEKLY`\|`BIWEEKLY`\|`MONTHLY`), `committedThreshold?`, `aspirationalThreshold?` (0.01–1, 2 decimales) | `CreateCycleDto` | `CyclesService.create(dto)` | Cycle |
| `ACTIVATE_CYCLE` | `cycle: EntityRef<Cycle>` | — | `CyclesService.activate(actor, id)` | — |
| `CREATE_OBJECTIVE` | `ref`, `cycle: EntityRef<Cycle>`, `owner: { kind: "USER" \| "TEAM", entity: EntityRef }`, `title` (3–200), `description?` (≤2000), `origin` (`TOP_DOWN`\|`BOTTOM_UP`), `objectiveType` (`COMMITTED`\|`ASPIRATIONAL`; no se llama `type` porque choca con el discriminador de la acción; Nest lo mapea a `CreateObjectiveDto.type`), `parentObjective?: EntityRef<Objective>` (solo `EXISTING` y `PUBLISHED`) | `CreateObjectiveDto` | `ObjectivesService.create(actor, dto)` | Objective (DRAFT) |
| `CREATE_KEY_RESULT` | `ref`, `objective: EntityRef<Objective>`, `owner: EntityRef<User>`, `title` (1–200), `scoring` (`DERIVED`\|`MANUAL`), `unit?` (≤40), `startValue?`, `targetValue?` (decimal en string, solo `DERIVED`) | `CreateKeyResultDto` | `KeyResultsService.create(actor, objectiveId, dto)` | KeyResult |
| `SET_KEY_RESULT_OWNER` | `keyResult: EntityRef<KeyResult>`, `owner: EntityRef<User>` | `UpdateKeyResultDto` (`{ ownerId }`) | `KeyResultsService.update(actor, id, { ownerId })` | — |
| `ASSIGN_ADAPTATION_REQUEST` ⚠ | `request: EntityRef<AdaptationRequest>` (solo `EXISTING`), `assignee: EntityRef<User>` | DTO de asignación del módulo `adaptation-requests` (**nombre final pendiente**) | `AdaptationRequestsService.assign(actor, id, assigneeId)` (**nombre final pendiente**) | — |
| `MARK_ADAPTATION_REQUEST_DELIVERED` ⚠ | `request: EntityRef<AdaptationRequest>` (solo `EXISTING`) | DTO de cambio de estado del módulo (**pendiente**) | `AdaptationRequestsService.markDelivered(actor, id)` (**pendiente**) | — |

⚠ = acción **v1.1**, se habilita en la whitelist de Nest solo cuando el módulo `adaptation-requests` (otro cambio, en implementación) publique sus servicios. Rechazar una solicitud **no** está en la whitelist: exige una justificación escrita por una persona.

**Fuera de la whitelist v1 (deliberado):** rechazar solicitudes de documento adaptado (requiere justificación humana), cerrar ciclos (irreversible, calcula scores finales), publicar/borrar objetivos, borrar KRs, cambiar roles o desactivar usuarios, resetear claves, check-ins, feedback, reconocimientos. Si la persona los pide, el agente responde `intent: "HOW_TO"` con el paso a paso del manual.

### 4.4 Ejemplo de plan

```json
{
  "summary": "Voy a crear el equipo Datos dentro de Plataforma, dar de alta a Lucía Gómez y ponerla como líder.",
  "assumptions": ["Lucía tendrá rol LEADER porque va a liderar un equipo."],
  "actions": [
    { "type": "CREATE_TEAM", "ref": "t1", "name": "Datos",
      "parent": { "kind": "EXISTING", "handle": "T2" },
      "sourceQuote": "creá el equipo Datos dentro de Plataforma" },
    { "type": "CREATE_USER", "ref": "u1", "name": "Lucía Gómez", "email": "lucia.gomez@flockit.com.ar", "role": "LEADER",
      "sourceQuote": "dá de alta a Lucía Gómez (lucia.gomez@flockit.com.ar)" },
    { "type": "SET_TEAM_MEMBER", "team": { "kind": "NEW", "ref": "t1" }, "user": { "kind": "NEW", "ref": "u1" }, "isLead": true,
      "sourceQuote": "que sea la líder" }
  ]
}
```

## 5. `POST /v1/admin/chat`

### 5.1 Request

| Campo | Tipo | Reglas |
|---|---|---|
| `locale` | `"es"` | Único valor v1 |
| `today` | `string` | `YYYY-MM-DD` en la zona de la organización (para "el próximo trimestre", etc.) |
| `message` | `string` | 1–2000 chars. Mensaje actual de la persona ADMIN |
| `history` | `ChatTurn[]` | 0–10, del más viejo al más nuevo (sin incluir `message`) |
| `catalog` | `Catalog` | §3.4 |
| `catalogTruncated` | `boolean` | |
| `helpChunks` | `HelpChunk[]` | 0–6, §3.5 |
| `repair` | `{ previousPlan: Plan, issues: PlanIssue[] } \| null` | Solo en el **segundo** intento de un mismo turno, cuando NestJS rechazó el plan. Máximo 1 reparación por turno |

`PlanIssue` = `{ actionIndex: int \| null, code: string, message: string }` (códigos en §8.2).

### 5.2 Pipeline del agente (informativo)

1. `InputGuard` (determinista): largos, PII mask. `CLASSIFY` (tier `classify`, prompt `admin_classify`) → `intent` + `injectionSuspected`. Si `injectionSuspected` → `422 INPUT_REJECTED` (`reason: "INJECTION_SUSPECTED"`), sin llamar al planner.
2. Según `intent`:
   - `ACTION` → `PLAN` (tier `planner`, prompt `admin_planner`, `output_schema=Plan`) → validación Pydantic → `REPAIR` (1 vez) si no parsea → desenmascarado PII → checks deterministas locales (handles existen, refs anteriores, `sourceQuote` presente en mensajes ADMIN).
   - `QUERY` → `PLAN` con prompt `admin_query` y `output_schema=ReadQuery` (§5.5): el agente solo **traduce** la pregunta a un filtro tipado.
   - `HOW_TO` → `ANSWER` (tier `generate`, prompt `help_answer`) con `helpChunks`.
   - `CLARIFY` / `OUT_OF_SCOPE` / `SMALL_TALK` → `ANSWER` breve (tier `generate`, prompt `admin_reply`).
3. Si hay `repair`, se salta `CLASSIFY` y va directo a `PLAN` con los `issues`.

### 5.3 Response 200

| Campo | Tipo | Notas |
|---|---|---|
| `traceId` | `string` | |
| `intent` | `"ACTION" \| "QUERY" \| "HOW_TO" \| "CLARIFY" \| "OUT_OF_SCOPE" \| "SMALL_TALK"` | `QUERY` = consulta de **solo lectura** (auditoría, solicitudes de adaptación) |
| `reply` | `string` | 1–800 chars, lenguaje claro, voseo. Siempre presente (con `ACTION` es la introducción al plan) |
| `plan` | `Plan \| null` | No nulo solo si `intent = "ACTION"` |
| `query` | `ReadQuery \| null` | No nulo solo si `intent = "QUERY"` (§5.5) |
| `citations` | `string[]` | Ids de `HelpChunk` usados (subconjunto de los enviados). Vacío si no aplica |
| `checks` | `{ piiMasked: int, injectionSuspected: false, planLocalIssues: PlanIssue[] }` | `planLocalIssues` = problemas que el agente detectó y no pudo reparar (Nest igual revalida todo) |
| `prompt` | `PromptRef` | Prompt del paso final |
| `usage` | `UsageStep[]` | |

### 5.4 Ejemplo

Request (resumido):

```json
{
  "locale": "es",
  "today": "2026-10-18",
  "message": "Creá el equipo Datos dentro de Plataforma, dá de alta a Lucía Gómez (lucia.gomez@flockit.com.ar) y que sea la líder",
  "history": [],
  "catalog": {
    "users": [{ "handle": "U1", "name": "Ana Pérez", "role": "ADMIN", "active": true, "teams": ["T1"] }],
    "teams": [
      { "handle": "T1", "name": "Flock IT", "parent": null, "leads": ["U1"], "memberCount": 12 },
      { "handle": "T2", "name": "Plataforma", "parent": "T1", "leads": [], "memberCount": 4 }
    ],
    "cycles": [{ "handle": "C1", "name": "Q4 2026", "kind": "QUARTER", "status": "ACTIVE", "parent": "C2", "startDate": "2026-10-01", "endDate": "2026-12-31" }],
    "objectives": [],
    "keyResults": []
  },
  "catalogTruncated": false,
  "helpChunks": [],
  "repair": null
}
```

Response:

```json
{
  "traceId": "8a0f3c1e-1d2b-4c5a-9e8f-7b6a5c4d3e2f",
  "intent": "ACTION",
  "reply": "Preparé un plan con 3 pasos. Revisalo y, si está bien, tocá «Confirmar y ejecutar».",
  "plan": { "...": "ver §4.4" },
  "citations": [],
  "checks": { "piiMasked": 1, "injectionSuspected": false, "planLocalIssues": [] },
  "prompt": { "id": "admin_planner", "version": "1", "hash": "a1b2c3d4e5f6" },
  "usage": [
    { "step": "CLASSIFY", "attempt": 1, "model": "nvidia/nemotron-3-super-120b-a12b", "isFallback": false, "promptId": "admin_classify", "promptVersion": "1", "promptHash": "0f1e2d3c4b5a", "inputTokens": 420, "outputTokens": 30, "latencyMs": 1200, "costUsdEst": 0.000156, "status": "OK", "errorCode": null },
    { "step": "PLAN", "attempt": 1, "model": "nvidia/nemotron-3-ultra-550b-a55b", "isFallback": false, "promptId": "admin_planner", "promptVersion": "1", "promptHash": "a1b2c3d4e5f6", "inputTokens": 2100, "outputTokens": 380, "latencyMs": 6400, "costUsdEst": 0.00324, "status": "OK", "errorCode": null }
  ]
}
```

### 5.5 `ReadQuery` (consultas de solo lectura)

El agente nunca ve los registros: devuelve un **filtro tipado**; NestJS lo valida, lo ejecuta con el servicio existente (solo ADMIN, sin confirmación porque no escribe) y **renderiza el resultado de forma determinista** (tabla en el chat con link a la pantalla). Los resultados **no** vuelven al LLM en v1 (sin riesgo de fidelidad ni de inyección por contenido de auditoría).

Unión discriminada por `type`:

| `type` | Campos | Ejecuta en Nest |
|---|---|---|
| `AUDIT_SEARCH` | `action?` (valor de `AuditAction`, p. ej. `USER_ROLE_CHANGED`), `entity?: { entityType: "User"\|"Team"\|"Cycle"\|"Objective"\|"KeyResult", handle: Handle }`, `actor?: Handle`, `from?`, `to?` (`YYYY-MM-DD`), `limit` (1–20, default 10), `sourceQuote` | `AuditService.list(ListAuditQueryDto)` (existente, `GET /audit` ADMIN). Si el otro cambio agrega filtros, se usan; si no, se filtra con los existentes (`entityType`, `entityId`, `actorId`, `action`, `from`, `to`) |
| `ADAPTATION_REQUESTS_LIST` ⚠ | `status?: ("PENDING"\|"IN_PROGRESS"\|"DELIVERED"\|"REJECTED")[]`, `overdueOnly?: boolean`, `assignee?: Handle`, `limit` (1–20), `sourceQuote` | Servicio de listado del módulo `adaptation-requests` (**nombre final pendiente**) |

Ejemplo — "¿Quién cambió el rol de Ana Pérez?":

```json
{ "intent": "QUERY", "reply": "Busco en la auditoría los cambios de rol de Ana Pérez.",
  "query": { "type": "AUDIT_SEARCH", "action": "USER_ROLE_CHANGED", "entity": { "entityType": "User", "handle": "U1" }, "limit": 10,
             "sourceQuote": "quién cambió el rol de Ana Pérez" },
  "plan": null, "citations": [] }
```

## 6. `POST /v1/admin/digest-summary`

### 6.1 Request

| Campo | Tipo | Reglas |
|---|---|---|
| `locale` | `"es"` | |
| `today` | `string` | `YYYY-MM-DD` |
| `facts` | `DigestFacts` | Calculados de forma **determinista** por NestJS |

`DigestFacts` (todas las listas ≤ 5 ejemplos; los `count` son totales reales):

| Campo | Tipo | Significado |
|---|---|---|
| `overdueCheckIns` | `{ count, examples: { krTitle, objectiveTitle, ownerName, daysOverdue }[] }` | KRs de objetivos `PUBLISHED` en ciclos no cerrados con check-in vencido según la cadencia del ciclo |
| `krsInRed` | `{ count, examples: { krTitle, objectiveTitle, ownerName }[] }` | KRs cuyo último check-in tiene banda `RED` |
| `cyclesEndingSoon` | `{ count, examples: { cycleName, endDate, daysLeft }[] }` | Ciclos `ACTIVE` que terminan en ≤ 14 días |
| `cyclesToClose` | `{ count, examples: { cycleName, endDate, daysPast }[] }` | Ciclos `ACTIVE` con `endDate` < `today` |
| `draftsNotPublishable` | `{ count, examples: { objectiveTitle, ownerName, krCount, ownerObjectiveCount }[] }` | Objetivos `DRAFT` en ciclos `ACTIVE` que hoy no se podrían publicar (< 3 KRs o el owner tiene < 3 objetivos en el ciclo) |
| `usersWithoutTeam` | `{ count, examples: { userName }[] }` | Usuarios activos sin equipo |
| `teamsWithoutLead` | `{ count, examples: { teamName }[] }` | Equipos sin ningún líder |
| `adaptationsNeedingReview` | `{ count }` | `AdaptedContent` en `NEEDS_REVIEW` **excluyendo `FEEDBACK`** (solo conteo) |
| `adaptationRequestsOpen` ⚠ | `{ count, overdueCount, unassignedCount, examples: { entityKind, preferredFormat, dueDate, daysLeft }[] }` | Solicitudes de documento adaptado `PENDING`/`IN_PROGRESS` (art. 14.5). **Sin nombre de quien solicita** ni texto del pedido. Depende del módulo `adaptation-requests` |
| `recentSensitiveChanges` | `{ count, examples: { action: "USER_ROLE_CHANGED"\|"USER_DEACTIVATED"\|"KR_TARGET_CHANGED"\|"CYCLE_THRESHOLDS_CHANGED", actorName, entityLabel, at }[] }` | Entradas de `AuditLog` de las últimas 72 h de esas acciones (desde `AuditService`/Prisma). Sin `before`/`after` |

**Nunca** se incluye feedback (ni contenido ni conteos), reconocimientos por persona, ni puntajes individuales.

### 6.2 Response 200

| Campo | Tipo | Notas |
|---|---|---|
| `traceId` | `string` | |
| `summary` | `{ headline: string, items: { factKey: string, text: string }[] }` | `headline` ≤ 200 chars; `items` ≤ 8, uno por `factKey` con `count > 0`, en orden de prioridad (vencidos y ciclos a cerrar primero). `text` ≤ 300 chars |
| `checks` | `{ numbersFaithful: boolean, unknownNumbers: string[], unknownNames: string[], fallbackUsed: boolean }` | El agente verifica que **todo número** del texto esté en `facts` y que todo nombre propio citado venga de `examples`. Si falla tras 1 regeneración, devuelve un resumen **de plantilla determinista** con `fallbackUsed: true` (nunca error por fidelidad) |
| `prompt` | `PromptRef` | |
| `usage` | `UsageStep[]` | `SUMMARIZE` (+ `REPAIR`) |

NestJS **vuelve a verificar** la fidelidad (mismos tokens numéricos) antes de mostrar; si no coincide, usa su propia plantilla.

### 6.3 Ejemplo de respuesta

```json
{
  "traceId": "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  "summary": {
    "headline": "Hay 2 temas para revisar hoy.",
    "items": [
      { "factKey": "overdueCheckIns", "text": "7 resultados clave tienen el check-in vencido. El más atrasado es «Bajar el tiempo de respuesta», de Juan Díaz, con 12 días." },
      { "factKey": "cyclesEndingSoon", "text": "El ciclo Q4 2026 termina en 10 días." }
    ]
  },
  "checks": { "numbersFaithful": true, "unknownNumbers": [], "unknownNames": [], "fallbackUsed": false },
  "prompt": { "id": "digest_summary", "version": "1", "hash": "9e8d7c6b5a40" },
  "usage": []
}
```

## 7. `POST /v1/help/answer`

### 7.1 Request

| Campo | Tipo | Reglas |
|---|---|---|
| `locale` | `"es"` | |
| `audience` | `"ADMIN" \| "LEADER" \| "MEMBER"` | NestJS solo envía fragmentos del manual que corresponde al rol (ADMIN: ambos) |
| `question` | `string` | 1–500 chars |
| `chunks` | `HelpChunk[]` | 1–6 |

### 7.2 Response 200

| Campo | Tipo | Notas |
|---|---|---|
| `traceId` | `string` | |
| `answer` | `string` | ≤ 1200 chars, lenguaje claro, pasos numerados si es una tarea |
| `citations` | `string[]` | ≥ 1 si `found`; subconjunto **estricto** de los ids enviados (el agente descarta ids inventados) |
| `found` | `boolean` | `false` si los fragmentos no responden la pregunta: `answer` lo dice y sugiere buscar en `/ayuda`. El agente **no** responde con conocimiento propio |
| `prompt` | `PromptRef` | |
| `usage` | `UsageStep[]` | `ANSWER` (+ `REPAIR`) |

Cuando `/v1/admin/chat` resuelve `intent = "HOW_TO"`, usa internamente este mismo sub-pipeline y devuelve `reply = answer`, `citations`.

## 8. Errores

Se hereda el envelope y la tabla de §5 del contrato base. Particularidades:

### 8.1 Agente

| `error.code` | Cuándo (en esta extensión) |
|---|---|
| `INVALID_REQUEST` | Catálogo con handles mal formados o duplicados, más de 6 `helpChunks`, `repair` con plan que no parsea |
| `INPUT_REJECTED` | `reason: "EMPTY" \| "TOO_LONG" \| "INJECTION_SUSPECTED" \| "OUT_OF_SCOPE"`. En `/v1/admin/chat`, "fuera de alcance" **no** es error: se responde 200 con `intent: "OUT_OF_SCOPE"`; solo se usa `INPUT_REJECTED` para inyección o largos |
| `OUTPUT_INVALID` | El plan no cumple el schema tras `REPAIR` |
| `MODEL_UNAVAILABLE` / `RATE_LIMITED` / `INTERNAL` | Igual que el contrato base |

### 8.2 Validación del plan en NestJS (`PlanIssue.code`)

NestJS no confía en `checks.planLocalIssues`: revalida todo y, si encuentra problemas, pide **una** reparación (`repair`) y, si persisten, muestra el plan como **no ejecutable** con los motivos.

| `code` | Motivo |
|---|---|
| `UNKNOWN_ACTION` | `type` fuera de la whitelist (incluye las acciones ⚠ mientras el módulo `adaptation-requests` no esté habilitado) |
| `UNKNOWN_HANDLE` | Handle inexistente en el catálogo del pedido o de otro tipo |
| `UNKNOWN_REF` | `ref` no definido antes en el plan, o de otro tipo |
| `DUPLICATE_REF` | `ref` repetido |
| `UNGROUNDED` | `sourceQuote` no aparece en los mensajes ADMIN recientes |
| `DTO_INVALID` | El payload armado no pasa `class-validator` del DTO de Nest (detalle por campo) |
| `EMAIL_TAKEN` | Ya existe un usuario con ese email (o se repite en el plan) |
| `TEAM_NAME_TAKEN` | Nombre repetido bajo el mismo padre |
| `OBJECTIVE_LIMIT` | El owner superaría 5 objetivos en el ciclo |
| `KR_LIMIT` | El objetivo superaría 5 KRs |
| `CYCLE_NOT_EDITABLE` | Ciclo cerrado, o `ACTIVATE_CYCLE` sobre un ciclo que no está en `DRAFT` |
| `PARENT_NOT_PUBLISHED` | Alineación a un objetivo no publicado |
| `TOO_MANY_ACTIONS` | > 25 acciones |
| `QUERY_INVALID` | `ReadQuery` con tipo desconocido, handle de otro tipo o fechas inválidas |

Avisos **no bloqueantes** (`PlanWarning.code`): `WILL_NOT_BE_PUBLISHABLE` (quedará con < 3 KRs u owner con < 3 objetivos), `CREATES_ADMIN` (alta con rol `ADMIN`), `REMOVES_MEMBER`, `ACTIVATES_CYCLE`, `CATALOG_TRUNCATED`.

### 8.3 Mapeo en NestJS (errores nuevos del módulo `assistant`)

| Situación | HTTP Nest | `code` Nest |
|---|---|---|
| Persona no ADMIN (cualquier ruta `/assistant/*`) | 404 | `NOT_FOUND` (no se revela la existencia) |
| Agente caído / timeout / `MODEL_UNAVAILABLE` en chat | 503 | `AI_UNAVAILABLE` (el front degrada: novedades con plantilla, sin plan) |
| Plan inexistente o de otra persona | 404 | `ASSISTANT_PLAN_NOT_FOUND` |
| Plan vencido (`expiresAt` < ahora) | 410 | `ASSISTANT_PLAN_EXPIRED` |
| `planHash` no coincide | 409 | `ASSISTANT_PLAN_HASH_MISMATCH` |
| Plan no ejecutable (tiene `issues`) | 422 | `ASSISTANT_PLAN_INVALID` |
| Plan ya confirmado / ejecutado / descartado | 409 | `ASSISTANT_PLAN_ALREADY_DECIDED` (devuelve el resultado guardado si ya se ejecutó) |
| Fallo de un paso | 200 | La ejecución responde `status: "PARTIAL"` o `"FAILED"` con el detalle por paso (no es un error HTTP) |

## 9. Fixtures

Los fixtures de esta extensión viven en `okr-platform-agent/tests/contract/fixtures/admin/*.json` y se copian a `okr-platform-back/okr-platform/test/fixtures/agent/admin/` (mismo mecanismo que el contrato base). Mínimos: `chat-action-ok.json`, `chat-query-audit.json`, `chat-howto-ok.json`, `chat-clarify.json`, `chat-injection-rejected.json`, `chat-plan-ungrounded.json`, `chat-plan-repair.json`, `digest-ok.json`, `digest-fallback.json`, `help-answer-ok.json`, `help-answer-not-found.json`, `error-model-unavailable.json`.

## 10. Versionado

- Agregar un `type` a la whitelist = cambio **compatible** si NestJS lo conoce antes que el agente (Nest rechaza tipos desconocidos con `UNKNOWN_ACTION`). Se documenta como v1.x en este archivo.
- Cambiar campos de una acción existente o el significado de un handle = **v2** (`/v2/admin/...`).

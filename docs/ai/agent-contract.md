# Contrato HTTP NestJS ⇄ okr-platform-agent (v1)

> **Fuente única de acoplamiento** entre `okr-platform-back` (cliente) y `okr-platform-agent` (servidor Python, ADK + LiteLLM → NVIDIA NIM). Ambos lados se construyen y testean contra este archivo. Cualquier cambio de forma es un cambio de contrato: se versiona el path (`/v2/...`) o se agrega un campo **opcional** compatible.
>
> Cambio SDD: `ia-accesibilidad-cognitiva`. Versión de contrato: **1**.

---

## 1. Principios

1. El agente **no tiene BD ni herramientas que escriban**. Recibe texto ya minimizado por NestJS y devuelve sugerencias estructuradas.
2. NestJS decide permisos y es el **único** que persiste (`LlmCall`, `AdaptedContent`, `AiSuggestion`, `AuditLog`).
3. **Nunca un 500 crudo**: toda respuesta (éxito o error) es JSON con `traceId` y `usage[]`, para que NestJS registre cada llamada al LLM aunque el pipeline haya fallado.
4. Nombres de campos en `camelCase` (JSON). Enums en `UPPER_SNAKE_CASE`, alineados con los enums de Prisma.
5. Encoding: `application/json; charset=utf-8`. Tamaño máximo del body: **64 KiB** (más grande → `INVALID_REQUEST`).

## 2. Endpoints

| Método | Path | Auth | Descripción |
|---|---|---|---|
| `POST` | `/v1/adapt` | HMAC | Versión en lectura fácil (`EASY_READ`) o lenguaje claro (`PLAIN`) de un objetivo, check-in o feedback |
| `POST` | `/v1/okr-suggest` | HMAC | Sugerencia de redacción de un objetivo y sus KRs |
| `POST` | `/v1/checkin-summary` | HMAC | Resumen del historial de check-ins de un KR |
| `GET` | `/health` | ninguna | Estado, versión, modelos configurados y prompts cargados (sin secretos) |

Puerto por defecto del agente: **8088** (`AGENT_PORT`).

## 3. Autenticación HMAC

Todas las rutas `/v1/*` exigen tres headers:

| Header | Valor | Ejemplo |
|---|---|---|
| `X-Agent-Timestamp` | Unix epoch en **segundos** (entero, string decimal) | `1792339200` |
| `X-Agent-Signature` | `sha256=` + HMAC-SHA256 en **hex minúscula** | `sha256=9f2c…e41a` |
| `X-Trace-Id` | UUID v4 generado por NestJS por cada pedido de negocio | `3b1f6c2e-8f4d-4a51-9a63-2d7f0c9e5b10` |

**String firmado**: `"{X-Agent-Timestamp}.{rawBody}"` — el timestamp, un punto (`.`) y los **bytes exactos del body** tal como viajan (UTF-8). Clave: `AGENT_SHARED_SECRET` (mismo valor en ambos servicios, mínimo 32 bytes aleatorios).

```text
signature = hex( HMAC_SHA256( key = AGENT_SHARED_SECRET, msg = timestamp + "." + rawBody ) )
X-Agent-Signature: sha256=<signature>
```

Reglas del servidor (agente):

- Lee el **body crudo** antes de parsear JSON y verifica sobre esos bytes (no re-serializar).
- Compara en tiempo constante (`hmac.compare_digest`).
- Rechaza si `|now - timestamp| > 300` s (skew de **5 minutos**), si falta algún header o si la firma no coincide → `401 UNAUTHORIZED`.
- `X-Trace-Id` ausente o no-UUID → `401 UNAUTHORIZED` (es parte del pedido autenticado).
- Riesgo aceptado: dentro de la ventana de 5 min un pedido es re-ejecutable (replay). Es aceptable porque los endpoints no escriben nada; solo consumen tokens.

Reglas del cliente (NestJS, `ai.client.ts`):

- Serializa el body **una sola vez** (`JSON.stringify`) y envía exactamente esos bytes como body y como parte de la firma.
- `GET /health` no lleva firma.

### 3.1 Propagación de `traceId`

- NestJS genera el UUID, lo envía en `X-Trace-Id` y lo guarda en cada fila `LlmCall.traceId` y en `AdaptedContent.traceId` / `AiSuggestion.traceId`.
- El agente lo **devuelve** en el body (`traceId`) y en el header de respuesta `X-Trace-Id`, y lo adjunta a la traza OTel/Langfuse como atributo `okr.trace_id` (y como `session.id` de Langfuse) para poder cruzar fila ⇄ traza.

## 4. Tipos comunes

### 4.1 `UsageStep` (una entrada por **cada intento** de llamada a un LLM)

Los pasos deterministas (validación, PII, legibilidad, preservación de números) **no** generan entradas en `usage[]`; sus resultados viajan en `checks`.

| Campo | Tipo | Notas |
|---|---|---|
| `step` | `"CLASSIFY" \| "GENERATE" \| "REPAIR" \| "JUDGE" \| "REGENERATE"` | `REPAIR` = reintento con mensaje de reparación por JSON inválido; `REGENERATE` = regeneración tras fallar la verificación |
| `attempt` | `int ≥ 1` | 1 = primer intento del paso; 2 = reintento (mismo modelo); el fallback también incrementa |
| `model` | `string` | ID de NVIDIA NIM **efectivamente usado** (p. ej. `meta/llama-3.3-70b-instruct` si entró el fallback) |
| `isFallback` | `boolean` | `true` si el modelo es el de fallback del tier |
| `promptId` | `string` | p. ej. `easy_read` |
| `promptVersion` | `string` | p. ej. `1` |
| `promptHash` | `string` | SHA-256 hex (primeros 12 chars) del archivo de prompt |
| `inputTokens` | `int ≥ 0` | Reportado por el proveedor; `0` si el intento falló antes de respuesta |
| `outputTokens` | `int ≥ 0` | idem |
| `latencyMs` | `int ≥ 0` | Latencia del intento |
| `costUsdEst` | `number` (≥0, 8 decimales) | **Estimación** según `pricing_usd_per_1m` de `config/models.yaml`. El free tier de NVIDIA no factura |
| `status` | `"OK" \| "FAILED"` | |
| `errorCode` | `string \| null` | Si `FAILED`: `TIMEOUT`, `UPSTREAM_ERROR`, `UPSTREAM_RATE_LIMITED`, `INVALID_JSON`, `SCHEMA_MISMATCH` |

### 4.2 `ReadabilityMetrics`

| Campo | Tipo | Notas |
|---|---|---|
| `fernandezHuerta` | `number` | Índice de Fernández-Huerta (0–100, mayor = más fácil) |
| `szigrisztPazos` | `number` | Índice de perspicuidad de Szigriszt-Pazos (base de la escala INFLESZ) |
| `infleszBand` | `"MUY_DIFICIL" \| "ALGO_DIFICIL" \| "NORMAL" \| "BASTANTE_FACIL" \| "MUY_FACIL"` | Cortes INFLESZ sobre Szigriszt-Pazos: <40, 40–55, 55–65, 65–80, >80 |
| `words` | `int` | |
| `sentences` | `int` | |
| `avgSentenceLength` | `number` | Palabras por oración |
| `maxSentenceLength` | `int` | Palabras de la oración más larga |
| `unexplainedAcronyms` | `string[]` | Siglas (2+ mayúsculas) sin explicación entre paréntesis ni en el glosario |

### 4.3 `Checks`

| Campo | Tipo | Notas |
|---|---|---|
| `piiMasked` | `int` | Cantidad de reemplazos de PII (emails, DNI/NIE, teléfonos) hechos antes de enviar texto a NVIDIA. El texto devuelto ya viene **desenmascarado**; la tabla de reemplazo vive solo en memoria del request |
| `sensitiveContent` | `boolean` | El clasificador detectó contenido sensible (salud, etc.): se procesa pero fuerza `needsHumanReview=true` |
| `numbersPreserved` | `boolean` | Todos los números, fechas, porcentajes y `mustPreserve` del origen aparecen en la salida |
| `missingTokens` | `string[]` | Tokens que faltan en la salida (vacío si `numbersPreserved`) |
| `judge` | `{ verdict: "FAITHFUL" \| "UNFAITHFUL" \| "SKIPPED", reasons: string[] }` | LLM-as-judge de otra familia de modelos |
| `regenerated` | `boolean` | Hubo una regeneración por fallo de verificación |

### 4.4 `needsHumanReview` y `reviewReason`

- `needsHumanReview: boolean` está en **todas** las respuestas 200.
- Es `true` cuando: la verificación falla dos veces (el resultado contiene el **texto original**, sin adaptar), o el clasificador marcó `sensitiveContent`, o la legibilidad de salida no alcanza el mínimo del nivel (`EASY_READ`: `szigrisztPazos ≥ 65`; `PLAIN`: `≥ 55`) tras la regeneración.
- `reviewReason: "VERIFICATION_FAILED" \| "SENSITIVE_CONTENT" \| "READABILITY_BELOW_MIN" \| null`.
- Es el gancho para la validación humana del RD 707/2026 art. 4.2.g: NestJS guarda el contenido con estado `NEEDS_REVIEW`.

### 4.5 `PromptRef`

`{ "id": string, "version": string, "hash": string }` — prompt del paso de generación final.

## 5. Envelope de error

Toda respuesta no-2xx del agente tiene esta forma (nunca HTML, nunca stack traces):

```json
{
  "traceId": "3b1f6c2e-8f4d-4a51-9a63-2d7f0c9e5b10",
  "error": {
    "code": "MODEL_UNAVAILABLE",
    "message": "El modelo de generación no respondió a tiempo (primario y fallback).",
    "retryable": true,
    "details": { "step": "GENERATE" }
  },
  "usage": [ /* UsageStep[] de los intentos realizados, puede estar vacío */ ]
}
```

| `error.code` | HTTP | `retryable` | Cuándo | `details` |
|---|---|---|---|---|
| `UNAUTHORIZED` | 401 | false | Falta header, firma inválida, skew > 5 min, `X-Trace-Id` inválido | `{}` (no se revela cuál falló). `usage` vacío; `traceId` puede ser `null` |
| `INVALID_REQUEST` | 400 | false | Body no es JSON, no cumple el schema o supera 64 KiB | `{ "fields": [{ "path": "segments.0.text", "issue": "..." }] }` |
| `INPUT_REJECTED` | 422 | false | Entrada vacía, demasiado larga, fuera de alcance o sospecha de prompt injection. **No se llama al generador** | `{ "reason": "EMPTY" \| "TOO_LONG" \| "OUT_OF_SCOPE" \| "INJECTION_SUSPECTED" }` |
| `OUTPUT_INVALID` | 502 | true | La salida del generador no parsea / no cumple el schema Pydantic tras el reintento de reparación | `{ "step": "GENERATE" \| "REGENERATE" }` |
| `MODEL_UNAVAILABLE` | 503 | true | Timeout o error del proveedor en primario + reintento + fallback, o se agotó el deadline total del pedido (`AGENT_REQUEST_DEADLINE_S`, default 120 s) | `{ "step": "..." }` |
| `RATE_LIMITED` | 429 | true | El limitador de concurrencia del agente no obtuvo turno en 5 s, o NVIDIA devolvió 429 tras los reintentos. Incluye header `Retry-After` (segundos) | `{ "retryAfterSeconds": 10 }` |
| `INTERNAL` | 500 | true | Excepción no prevista (bug). Igual se responde con este envelope | `{}` |

### 5.1 Mapeo en NestJS (`ai.errors.ts`)

| Origen | HTTP Nest | `code` Nest |
|---|---|---|
| `AI_ENABLED=false` | 503 | `AI_DISABLED` |
| Conexión rechazada, timeout del cliente (`AGENT_TIMEOUT_MS`, default 125000), `MODEL_UNAVAILABLE`, `INTERNAL`, `UNAUTHORIZED` (es misconfiguración: se loguea, no se expone) | 503 | `AI_UNAVAILABLE` |
| `RATE_LIMITED` | 429 | `AI_RATE_LIMITED` |
| `INPUT_REJECTED` | 422 | `AI_INPUT_REJECTED` |
| `OUTPUT_INVALID` | 502 | `AI_OUTPUT_INVALID` |
| `INVALID_REQUEST` | 503 | `AI_UNAVAILABLE` (bug de integración: se loguea con `traceId`) |

En todos los casos de error con `usage[]` no vacío, NestJS **igual** inserta las filas `LlmCall`.

## 6. `POST /v1/adapt`

### 6.1 Request

| Campo | Tipo | Reglas |
|---|---|---|
| `level` | `"EASY_READ" \| "PLAIN"` | `EASY_READ` = lectura fácil (UNE 153101); `PLAIN` = lenguaje claro (UNE-ISO 24495-1) |
| `entityType` | `"OBJECTIVE" \| "CHECK_IN" \| "FEEDBACK"` | Ajusta el prompt (contexto del texto) |
| `locale` | `"es"` | Reservado; único valor admitido en v1 |
| `segments` | `{ key: string, text: string }[]` | 1–30 ítems. `key` ≤ 64 chars, patrón `^[a-z0-9_.]+$`. `text` 1–4000 chars. Suma total ≤ 12000 chars |
| `mustPreserve` | `string[]` | Opcional, ≤ 50 ítems, ≤ 64 chars c/u. Tokens literales que deben aparecer en la salida (p. ej. metas de KR). El agente además extrae números/fechas/porcentajes del origen por regex |

Claves de segmento que usa NestJS (minimización): `objective.title`, `objective.description`, `kr.{position}.title`, `kr.{position}.target` (texto armado: `"de 40 a 75 %"`), `checkin.note`, `checkin.action`, `checkin.kr_title`, `feedback.content`. Nunca nombres, emails ni IDs.

### 6.2 Response 200

| Campo | Tipo |
|---|---|
| `traceId` | `string` (UUID) |
| `needsHumanReview` | `boolean` |
| `reviewReason` | ver 4.4 |
| `result.level` | igual al request |
| `result.segments` | `{ key, text }[]` — **mismas claves y mismo orden** que el request |
| `result.glossary` | `{ term: string, explanation: string }[]` (0–15) — palabras difíciles o siglas explicadas |
| `readability.source` | `ReadabilityMetrics` (texto original concatenado) |
| `readability.output` | `ReadabilityMetrics` (texto devuelto concatenado) |
| `checks` | `Checks` |
| `prompt` | `PromptRef` |
| `usage` | `UsageStep[]` |

### 6.3 Ejemplo

Request:

```http
POST /v1/adapt HTTP/1.1
Host: agent:8088
Content-Type: application/json; charset=utf-8
X-Agent-Timestamp: 1792339200
X-Agent-Signature: sha256=5d1e0c7a4b9f2e83c6a1d0f74e2b9c58a3f61d27e0b4c9a8f5e2d1c0b7a69384
X-Trace-Id: 3b1f6c2e-8f4d-4a51-9a63-2d7f0c9e5b10

{
  "level": "EASY_READ",
  "entityType": "CHECK_IN",
  "locale": "es",
  "segments": [
    { "key": "checkin.kr_title", "text": "Reducir el tiempo medio de resolución de incidencias P1 de 8 h a 4 h" },
    { "key": "checkin.action", "text": "CONTINUE" },
    { "key": "checkin.note", "text": "Bajamos a 5,5 h gracias al runbook nuevo; el SLA del proveedor sigue siendo el cuello de botella y lo escalamos al comité el 15/11." }
  ],
  "mustPreserve": ["8 h", "4 h", "5,5 h", "15/11"]
}
```

Response:

```json
{
  "traceId": "3b1f6c2e-8f4d-4a51-9a63-2d7f0c9e5b10",
  "needsHumanReview": false,
  "reviewReason": null,
  "result": {
    "level": "EASY_READ",
    "segments": [
      { "key": "checkin.kr_title", "text": "Queremos arreglar más rápido los problemas graves. Antes tardábamos 8 h. La meta es tardar 4 h." },
      { "key": "checkin.action", "text": "Seguimos igual." },
      { "key": "checkin.note", "text": "Ahora tardamos 5,5 h. Mejoramos gracias a una guía nueva. Todavía hay un problema: el proveedor tarda mucho. El 15/11 se lo contamos al comité." }
    ],
    "glossary": [
      { "term": "proveedor", "explanation": "La empresa que nos da un servicio." },
      { "term": "comité", "explanation": "Un grupo de personas que toma decisiones." }
    ]
  },
  "readability": {
    "source": { "fernandezHuerta": 52.1, "szigrisztPazos": 47.8, "infleszBand": "ALGO_DIFICIL", "words": 37, "sentences": 2, "avgSentenceLength": 18.5, "maxSentenceLength": 23, "unexplainedAcronyms": ["SLA", "P1"] },
    "output": { "fernandezHuerta": 84.3, "szigrisztPazos": 79.6, "infleszBand": "BASTANTE_FACIL", "words": 52, "sentences": 8, "avgSentenceLength": 6.5, "maxSentenceLength": 10, "unexplainedAcronyms": [] }
  },
  "checks": {
    "piiMasked": 0,
    "sensitiveContent": false,
    "numbersPreserved": true,
    "missingTokens": [],
    "judge": { "verdict": "FAITHFUL", "reasons": [] },
    "regenerated": false
  },
  "prompt": { "id": "easy_read", "version": "1", "hash": "a91c03be77d2" },
  "usage": [
    { "step": "CLASSIFY", "attempt": 1, "model": "nvidia/nemotron-3-nano-30b-a3b", "isFallback": false, "promptId": "classify", "promptVersion": "1", "promptHash": "0c55e1f4a2b9", "inputTokens": 612, "outputTokens": 38, "latencyMs": 410, "costUsdEst": 0.00003820, "status": "OK", "errorCode": null },
    { "step": "GENERATE", "attempt": 1, "model": "nvidia/nemotron-3-super-120b-a12b", "isFallback": false, "promptId": "easy_read", "promptVersion": "1", "promptHash": "a91c03be77d2", "inputTokens": 1480, "outputTokens": 402, "latencyMs": 6120, "costUsdEst": 0.00084600, "status": "OK", "errorCode": null },
    { "step": "JUDGE", "attempt": 1, "model": "qwen/qwen3-next-80b-a3b-instruct", "isFallback": false, "promptId": "judge", "promptVersion": "1", "promptHash": "77be2d90c1aa", "inputTokens": 1950, "outputTokens": 96, "latencyMs": 2380, "costUsdEst": 0.00043650, "status": "OK", "errorCode": null }
  ]
}
```

> Los IDs de modelo de los ejemplos son **ilustrativos**: los vigentes se configuran en `config/models.yaml` y se verifican en build.nvidia.com.

## 7. `POST /v1/okr-suggest`

### 7.1 Request

| Campo | Tipo | Reglas |
|---|---|---|
| `cycleKind` | `"ANNUAL" \| "QUARTER"` | Contexto de horizonte |
| `objective.title` | `string` | 1–300 chars (puede ser un borrador pobre) |
| `objective.description` | `string \| null` | ≤ 2000 chars |
| `objective.type` | `"COMMITTED" \| "ASPIRATIONAL"` | |
| `keyResults` | `{ title: string, unit: string \| null, startValue: string \| null, targetValue: string \| null }[]` | 0–5 ítems; `title` 1–300 chars; valores decimales como **string** (igual que la API Nest) |

### 7.2 Response 200

| Campo | Tipo | Notas |
|---|---|---|
| `traceId`, `needsHumanReview`, `reviewReason`, `checks`, `prompt`, `usage` | ver §4 | `checks.numbersPreserved` controla que los `startValue`/`targetValue` no nulos del borrador se mantengan |
| `result.objective` | `{ title: string, description: string \| null, rationale: string }` | `title` ≤ 300 |
| `result.keyResults` | `{ title, unit, startValue, targetValue, rationale, proposedValues: boolean }[]` | 0–5. Mismo orden que el borrador; puede agregar KRs nuevos al final. `proposedValues=true` si el agente propuso números donde el borrador tenía `null` (la UI los resalta) |
| `result.warnings` | `{ code: "KR_IS_ACTIVITY" \| "KR_NOT_MEASURABLE" \| "OBJECTIVE_IS_METRIC" \| "TOO_MANY_KRS" \| "TOO_FEW_KRS", message: string }[]` | Observaciones sobre el borrador, en español (voseo) |
| `readability` | `{ output: ReadabilityMetrics }` | |

Reglas: el agente **no** cambia `startValue`/`targetValue` existentes; si lo hiciera, falla `numbersPreserved` → regenera → `needsHumanReview`.

### 7.3 Ejemplo

Request:

```json
{
  "cycleKind": "QUARTER",
  "objective": { "title": "mejorar soporte", "description": null, "type": "COMMITTED" },
  "keyResults": [
    { "title": "hacer runbooks", "unit": null, "startValue": null, "targetValue": null },
    { "title": "bajar tiempo de resolución P1", "unit": "h", "startValue": "8", "targetValue": "4" }
  ]
}
```

Response:

```json
{
  "traceId": "c0a8017e-2b3d-4e6f-8a9b-0c1d2e3f4a5b",
  "needsHumanReview": false,
  "reviewReason": null,
  "result": {
    "objective": {
      "title": "Dar un soporte rápido y predecible en incidencias críticas",
      "description": "Que los equipos usuarios recuperen el servicio en el mismo día cuando ocurre una incidencia P1 (crítica).",
      "rationale": "Un objetivo describe el resultado buscado, no la tarea."
    },
    "keyResults": [
      { "title": "Cubrir con runbook el 100 % de los tipos de incidencia P1 recurrentes", "unit": "%", "startValue": "0", "targetValue": "100", "rationale": "Convierte la actividad 'hacer runbooks' en un resultado medible.", "proposedValues": true },
      { "title": "Reducir el tiempo medio de resolución de incidencias P1 de 8 h a 4 h", "unit": "h", "startValue": "8", "targetValue": "4", "rationale": "Se mantiene la meta y se explicita el punto de partida.", "proposedValues": false }
    ],
    "warnings": [
      { "code": "KR_IS_ACTIVITY", "message": "\"hacer runbooks\" es una tarea; te proponemos medir su cobertura." },
      { "code": "TOO_FEW_KRS", "message": "Un objetivo necesita entre 3 y 5 resultados clave; sumá al menos uno más." }
    ]
  },
  "readability": { "output": { "fernandezHuerta": 66.0, "szigrisztPazos": 61.2, "infleszBand": "NORMAL", "words": 61, "sentences": 6, "avgSentenceLength": 10.2, "maxSentenceLength": 16, "unexplainedAcronyms": [] } },
  "checks": { "piiMasked": 0, "sensitiveContent": false, "numbersPreserved": true, "missingTokens": [], "judge": { "verdict": "FAITHFUL", "reasons": [] }, "regenerated": false },
  "prompt": { "id": "okr_suggest", "version": "1", "hash": "4e9d21c07fa3" },
  "usage": [
    { "step": "CLASSIFY", "attempt": 1, "model": "nvidia/nemotron-3-nano-30b-a3b", "isFallback": false, "promptId": "classify", "promptVersion": "1", "promptHash": "0c55e1f4a2b9", "inputTokens": 540, "outputTokens": 35, "latencyMs": 380, "costUsdEst": 0.00003400, "status": "OK", "errorCode": null },
    { "step": "GENERATE", "attempt": 1, "model": "nvidia/nemotron-3-super-120b-a12b", "isFallback": false, "promptId": "okr_suggest", "promptVersion": "1", "promptHash": "4e9d21c07fa3", "inputTokens": 0, "outputTokens": 0, "latencyMs": 20000, "costUsdEst": 0, "status": "FAILED", "errorCode": "TIMEOUT" },
    { "step": "GENERATE", "attempt": 2, "model": "nvidia/nemotron-3-super-120b-a12b", "isFallback": false, "promptId": "okr_suggest", "promptVersion": "1", "promptHash": "4e9d21c07fa3", "inputTokens": 1320, "outputTokens": 610, "latencyMs": 7450, "costUsdEst": 0.00100600, "status": "OK", "errorCode": null },
    { "step": "JUDGE", "attempt": 1, "model": "qwen/qwen3-next-80b-a3b-instruct", "isFallback": false, "promptId": "judge", "promptVersion": "1", "promptHash": "77be2d90c1aa", "inputTokens": 1890, "outputTokens": 120, "latencyMs": 2100, "costUsdEst": 0.00046350, "status": "OK", "errorCode": null }
  ]
}
```

## 8. `POST /v1/checkin-summary`

### 8.1 Request

| Campo | Tipo | Reglas |
|---|---|---|
| `level` | `"STANDARD" \| "PLAIN"` | `PLAIN` = resumen en lenguaje claro |
| `keyResult` | `{ title: string, scoring: "DERIVED" \| "MANUAL", unit: string \| null, startValue: string \| null, targetValue: string \| null, currentValue: string \| null }` | `title` ≤ 300 |
| `checkIns` | `{ date: string (YYYY-MM-DD), value: string \| null, score: number (0..1), band: "RED" \| "YELLOW" \| "GREEN", action: "CONTINUE" \| "UPDATE" \| "START" \| "STOP", note: string \| null }[]` | 1–52 ítems, **orden cronológico ascendente**; `note` ≤ 2000. Sin autor (minimización) |

### 8.2 Response 200

| Campo | Tipo | Notas |
|---|---|---|
| `traceId`, `needsHumanReview`, `reviewReason`, `checks`, `prompt`, `usage` | ver §4 | |
| `result.summary` | `string` | ≤ 1200 chars. Habla del **avance del KR**, nunca evalúa personas |
| `result.trend` | `"IMPROVING" \| "STABLE" \| "DECLINING" \| "INSUFFICIENT_DATA"` | **Determinista** (calculado por el agente sobre `score`, no por el LLM): <2 check-ins → `INSUFFICIENT_DATA`; pendiente de los últimos 4 scores > +0.05 → `IMPROVING`, < −0.05 → `DECLINING`, si no `STABLE` |
| `result.highlights` | `string[]` | 0–5 |
| `result.risks` | `string[]` | 0–5, bloqueos mencionados en las notas |
| `readability` | `{ output: ReadabilityMetrics }` | |

### 8.3 Ejemplo

Request:

```json
{
  "level": "PLAIN",
  "keyResult": { "title": "Reducir el tiempo medio de resolución de incidencias P1 de 8 h a 4 h", "scoring": "DERIVED", "unit": "h", "startValue": "8", "targetValue": "4", "currentValue": "5.5" },
  "checkIns": [
    { "date": "2026-10-01", "value": "7.5", "score": 0.125, "band": "RED", "action": "START", "note": "Arrancamos el relevamiento de incidencias." },
    { "date": "2026-10-08", "value": "6.5", "score": 0.375, "band": "RED", "action": "CONTINUE", "note": "Primer runbook publicado." },
    { "date": "2026-10-15", "value": "5.5", "score": 0.625, "band": "YELLOW", "action": "CONTINUE", "note": "El SLA del proveedor es el cuello de botella; se escala al comité el 15/11." }
  ]
}
```

Response:

```json
{
  "traceId": "9e7d6c5b-4a3f-4e2d-9c1b-0a9f8e7d6c5b",
  "needsHumanReview": false,
  "reviewReason": null,
  "result": {
    "summary": "En tres semanas el tiempo de resolución bajó de 7,5 h a 5,5 h. La meta es 4 h. El avance viene de los runbooks nuevos. El principal freno es el tiempo de respuesta del proveedor, que se va a tratar en el comité el 15/11.",
    "trend": "IMPROVING",
    "highlights": ["Se publicó el primer runbook.", "El tiempo bajó 2 h en tres semanas."],
    "risks": ["El acuerdo de servicio (SLA) del proveedor limita la mejora."]
  },
  "readability": { "output": { "fernandezHuerta": 71.4, "szigrisztPazos": 66.9, "infleszBand": "BASTANTE_FACIL", "words": 49, "sentences": 4, "avgSentenceLength": 12.3, "maxSentenceLength": 19, "unexplainedAcronyms": [] } },
  "checks": { "piiMasked": 0, "sensitiveContent": false, "numbersPreserved": true, "missingTokens": [], "judge": { "verdict": "FAITHFUL", "reasons": [] }, "regenerated": false },
  "prompt": { "id": "checkin_summary", "version": "1", "hash": "d03f8a61b2c7" },
  "usage": [
    { "step": "CLASSIFY", "attempt": 1, "model": "nvidia/nemotron-3-nano-30b-a3b", "isFallback": false, "promptId": "classify", "promptVersion": "1", "promptHash": "0c55e1f4a2b9", "inputTokens": 700, "outputTokens": 36, "latencyMs": 420, "costUsdEst": 0.00004220, "status": "OK", "errorCode": null },
    { "step": "GENERATE", "attempt": 1, "model": "nvidia/nemotron-3-super-120b-a12b", "isFallback": false, "promptId": "checkin_summary", "promptVersion": "1", "promptHash": "d03f8a61b2c7", "inputTokens": 1610, "outputTokens": 290, "latencyMs": 4980, "costUsdEst": 0.00077300, "status": "OK", "errorCode": null },
    { "step": "JUDGE", "attempt": 1, "model": "qwen/qwen3-next-80b-a3b-instruct", "isFallback": false, "promptId": "judge", "promptVersion": "1", "promptHash": "77be2d90c1aa", "inputTokens": 1720, "outputTokens": 88, "latencyMs": 1900, "costUsdEst": 0.00039000, "status": "OK", "errorCode": null }
  ]
}
```

## 9. `GET /health`

Sin auth. No llama a NVIDIA (no consume tokens). Nunca expone claves.

```json
{
  "status": "ok",
  "contractVersion": "1",
  "version": "0.1.0",
  "models": {
    "classify": { "model": "nvidia/nemotron-3-nano-30b-a3b", "fallback": "meta/llama-3.1-8b-instruct" },
    "generate": { "model": "nvidia/nemotron-3-super-120b-a12b", "fallback": "meta/llama-3.3-70b-instruct" },
    "judge": { "model": "qwen/qwen3-next-80b-a3b-instruct", "fallback": "mistralai/mistral-medium-3-instruct" }
  },
  "prompts": [
    { "id": "classify", "version": "1", "hash": "0c55e1f4a2b9" },
    { "id": "easy_read", "version": "1", "hash": "a91c03be77d2" },
    { "id": "plain_language", "version": "1", "hash": "b2e7f019c3d4" },
    { "id": "okr_suggest", "version": "1", "hash": "4e9d21c07fa3" },
    { "id": "checkin_summary", "version": "1", "hash": "d03f8a61b2c7" },
    { "id": "judge", "version": "1", "hash": "77be2d90c1aa" }
  ],
  "apiKeyConfigured": true
}
```

`status`: `"ok"` o `"degraded"` (`apiKeyConfigured=false` o config de modelos inválida). HTTP 200 en ambos casos; 503 solo si el proceso no puede atender.

## 10. Ejemplo de error completo

`POST /v1/adapt` con un texto que intenta inyectar instrucciones:

```http
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/json
X-Trace-Id: 5f0e9d8c-7b6a-4c5d-8e4f-3a2b1c0d9e8f
```

```json
{
  "traceId": "5f0e9d8c-7b6a-4c5d-8e4f-3a2b1c0d9e8f",
  "error": {
    "code": "INPUT_REJECTED",
    "message": "El texto no parece contenido de OKRs, check-ins o feedback.",
    "retryable": false,
    "details": { "reason": "INJECTION_SUSPECTED" }
  },
  "usage": [
    { "step": "CLASSIFY", "attempt": 1, "model": "nvidia/nemotron-3-nano-30b-a3b", "isFallback": false, "promptId": "classify", "promptVersion": "1", "promptHash": "0c55e1f4a2b9", "inputTokens": 420, "outputTokens": 30, "latencyMs": 350, "costUsdEst": 0.00002700, "status": "OK", "errorCode": null }
  ]
}
```

## 11. Timeouts y concurrencia (valores por defecto, configurables)

| Parámetro | Lado | Default |
|---|---|---|
| Timeout por intento de LLM | agente (`models.yaml` `defaults.timeout_s`) | 20 s |
| Reintentos por modelo | agente | 1 (backoff 1,5 s) y luego fallback |
| Deadline total del pedido | agente `AGENT_REQUEST_DEADLINE_S` | 120 s |
| Concurrencia máxima hacia NVIDIA | agente `AGENT_MAX_CONCURRENCY` | 4 |
| Espera máxima por turno | agente | 5 s → `RATE_LIMITED` |
| Timeout del cliente HTTP | Nest `AGENT_TIMEOUT_MS` | 125000 ms (> deadline del agente) |

## 12. Checklist de conformidad (ambos lados)

- [ ] El agente rechaza firma inválida, timestamp fuera de ±300 s y headers faltantes con `401` + envelope.
- [ ] Toda respuesta no-2xx tiene `traceId`, `error.code`, `error.retryable`, `usage`.
- [ ] `result.segments` de `/v1/adapt` conserva claves y orden.
- [ ] `usage[]` tiene una entrada por **intento** de LLM, incluidos los fallidos.
- [ ] NestJS persiste `usage[]` en `LlmCall` también en errores.
- [ ] Tests de contrato: el back (stub del agente) y el agente (tests de FastAPI) usan los **mismos ejemplos JSON** de este archivo, copiados como fixtures en `okr-platform-agent/tests/contract/` y `okr-platform-back/okr-platform/test/fixtures/agent/`.

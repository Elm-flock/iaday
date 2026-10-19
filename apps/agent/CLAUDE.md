# okr-platform-agent — convenciones del servicio

Servicio Python (FastAPI + Google ADK + LiteLLM -> NVIDIA NIM) que adapta textos de OKRs a lectura fácil / lenguaje claro,
sugiere redacciones de OKRs, resume check-ins y (extensión admin) **propone planes de administración**, redacta las novedades del admin y
responde preguntas "¿cómo hago X?" con el manual. **No tiene BD ni herramientas que escriban/ejecuten**: NestJS decide permisos, valida, confirma y persiste.

## Contrato (única fuente de acoplamiento)

`docs/ai/agent-contract.md` del monorepo (v1). Cualquier cambio de forma = cambio de contrato (nuevo path `/v2/...` o campo
**opcional**). Los ejemplos JSON del contrato están copiados en `tests/contract/fixtures/` y se validan contra `api/schemas.py`
(respuestas con `extra="forbid"`: un campo de más o de menos rompe el test). El lado NestJS usa los mismos fixtures.

## Extensión asistente admin (`docs/ai/agent-contract-admin.md`, v1)

`POST /v1/admin/chat` | `/v1/admin/digest-summary` | `/v1/help/answer` (mismo HMAC/envelope/límite 64 KiB). Fixtures: `tests/contract/fixtures/admin/`.
Código en `agent/admin/` (`plan_models`, `local_checks`, `planner_tools`, `digest_logic`, `agents`, `runner`, `text`, `prompt_blocks`) +
`api/admin_{schemas,routes}.py` + `guards/bm25.py`. Prompts v1: `admin_classify`, `admin_planner`, `admin_query`, `admin_reply`, `help_answer`, `digest_summary`.

- **Chat**: InputGuard (EMPTY/TOO_LONG, PII mask) -> `admin_classify` (injection -> 422) -> ACTION (planner) | QUERY (`admin_query` -> `ReadQuery`) |
  HOW_TO (`help_answer` con `helpChunks`) | CLARIFY/OUT_OF_SCOPE/SMALL_TALK (`admin_reply`). Con `repair` salta CLASSIFY.
- **Planner** (`models.yaml` tier `planner`): `mode: schema` (output_schema `PlannerOut` = Plan o `clarification`) | `tools` (FunctionTools
  que SOLO registran en `PipelineRun.scratch`; ensamblado determinista). `AGENT_PLANNER_MODE` lo pisa. En modo tools el fallback es `tools_fallback`.
- **Verificación local** (`local_checks`, mismos códigos que Nest): handles existen y son del tipo, refs previas, DUPLICATE_REF, `sourceQuote` literal en
  los mensajes ADMIN (actual + 3 previos, normalizado igual que Nest), DTO básico. UN REPAIR local (salvo que ya venga `repair` de Nest); si persisten,
  van en `checks.planLocalIssues`. Acción fuera de la whitelist / campo `password` => salida inválida => REPAIR => 502 OUTPUT_INVALID.
- **Inyección**: catálogo y hechos van en bloques `<<<DATOS NO CONFIABLES ...>>>` y se sanean (`text.sanitize_untrusted`: una línea, sin `<<<`/`>>>`).
  La defensa que NO depende del modelo es el anclaje `sourceQuote`.
- **Digest**: números por GRUPO (cada texto solo puede usar dígitos de sus hechos) + nombres/«títulos» ⊆ ejemplos + sin enums crudos; 1 regeneración (paso
  REPAIR) y si falla => plantilla determinista (`fallbackUsed=true`; `checks` describe la salida RECHAZADA del modelo). JSON irrecuperable => también plantilla.
- **Ayuda**: BM25-lite sobre los chunks enviados; sin ningún término en común se rehúsa SIN llamar al LLM; citas filtradas a las enviadas; `found=false` => respuesta fija.
- **v1.1 no implementado**: acciones/consulta de `adaptation-requests` (⚠ del contrato). El catálogo acepta `adaptationRequests` y el digest `adaptationRequestsOpen`.
- **Ambigüedad del contrato**: el campo `type` COMMITTED|ASPIRATIONAL de CREATE_OBJECTIVE choca con el discriminador `type`; el agente emite `objectiveType`.

## Entorno (Windows / PowerShell, SIN uv)

```powershell
python -m venv .venv
.venv\Scripts\pip install -e ".[dev]"
.venv\Scripts\pytest                 # sin red: usa FakeLlm
.venv\Scripts\ruff check src tests
.venv\Scripts\uvicorn okr_agent.api.main:app --port 8088   # exige .env (ver .env.example)
```

- Versiones **fijadas** en `pyproject.toml` (google-adk 2.12.0, litellm 1.106.0, langfuse 4.15.6, …). Subir una = correr toda la suite.
- Secretos SOLO por variables de entorno / `.env` (ignorado por git). Nunca hardcodear ni commitear claves. `.env.example` lleva placeholders.

## Arquitectura

```
POST /v1/*  ->  api/auth.py (HMAC sobre body crudo)  ->  api/main.py (parse + schema)  ->  agent/pipeline.py
SequentialAgent[ InputGuard -> GenerateStep -> Verify ]   (un pipeline por feature: adapt | okr_suggest | checkin_summary)
```

| Paso | Qué hace | LLM |
|---|---|---|
| `InputGuardAgent` | EMPTY/TOO_LONG, enmascara PII, `classify` (fail-closed) | classify tier |
| `GenerateStepAgent` | `generate_<feature>` + REPAIR si el JSON no valida | generate tier |
| `VerifyAgent` | fidelidad determinista, legibilidad, juez, UNA regeneración, respaldo = texto original | judge + generate |

- **Patrón de subagentes ADK**: `include_contents="none"`, `output_schema=<Pydantic>`, `output_key="<nombre>_result"`, `description`
  específica ("Handles X. Use for: … Don't use for: …"), sin `AgentTool` ni herramientas. El input entra por la instrucción.
- **Estado del pedido**: `PipelineRun` (en un `ContextVar`) — los agentes y el `ResilientLlm` lo leen de ahí. NO usar `{var}` de ADK.
- **Prompts**: `prompts/<id>/v<N>.md` con front-matter; render con `string.Template` (`$var`) como `InstructionProvider`
  (el templating `{var}` de ADK choca con las llaves del JSON). hash = sha256[:12] del archivo. **Nunca editar una versión publicada**:
  agregar `v2.md` (y, si hace falta fijarla, `prompts/active.yaml`).
- **Modelos**: `config/models.yaml` (IDs "VERIFICAR en build.nvidia.com"), overrides `AGENT_MODEL_<TIER>[_FALLBACK]`.
  Invariante: familia del juez ≠ familia del generador (el servicio no arranca si no).
- **`ResilientLlm`** (`BaseLlm` propio): timeout por intento, 1 reintento con backoff, fallback; registra un `UsageStep` por intento
  (éxito o error). El paso (`CLASSIFY|GENERATE|REPAIR|JUDGE|REGENERATE`) lo fija el agente de control en `PipelineRun.step_ctx`.
- Los pasos deterministas (guards) no generan `usage`; viajan en `checks`.
- **Nunca un 500 crudo**: todo error es el envelope del contrato con `traceId` y `usage[]` de los intentos hechos.

## Gotchas verificados (ADK 2.12)

- `SequentialAgent` está **deprecado** en favor de `Workflow` (sigue funcionando; migrar cuando `Workflow` pueda ser sub-agente).
- Con `include_contents="none"` cada subagente ve solo el disparador del usuario: la rama (`branch`) del subagente aísla los eventos
  de los demás pasos (verificado en `test_each_llm_sees_only_its_own_instruction_no_history_leak`).
- `LlmAgent` valida `output_schema` y **lanza** `ValidationError` si el texto no parsea: `steps/common.structured_call` lo captura,
  marca el intento como `FAILED` (`INVALID_JSON`/`SCHEMA_MISMATCH`) y hace el REPAIR. `state_delta[output_key]` es un `dict`
  (snake_case, `exclude_none=True`).
- `LiteLlm` toma el modelo de `llm_request.model`, no de `self.model`: `ResilientLlm` lo reescribe al delegar (primario/fallback).
- `ResilientLlm` limpia `<think>…</think>`, fences ```json y prosa alrededor del JSON antes de entregar a ADK.
- **JSON mode de NIM** (medido 2026-10-18): ADK con `output_schema` envía SIEMPRE `response_format: json_schema` (strict) por LiteLLM,
  nunca `json_object`. diffusiongemma EXIGE json_schema (rechaza `json_object` con 400); nemotron-super acepta ambos; nemotron-ultra
  con `json_object` anida mal ({"text":{"text":...}}); muse-glimmer devuelve vacío con `json_object`. Se controla por modelo con
  `model_options.<id>.json_mode` (`schema` default | `object` | `none`) y `extra_body` en `models.yaml`; `llm_factory.litellm_options`
  los pasa como kwargs de `LiteLlm` (que los aplica DESPUÉS del `response_format` de ADK). Siempre se valida con Pydantic y se repara.
- **Modelos de razonamiento**: nemotron-3-super/ultra gastan ~1.500 tokens y 30–43 s pensando; `extra_body.chat_template_kwargs.enable_thinking=false`
  los baja a 1–5 s. gpt-oss-20b razona siempre (6–15 s) y con `max_tokens` bajo devuelve contenido vacío.
- diffusiongemma a veces omite la llave inicial del JSON (`outOfScope": false, ...}`): `extract_json_text` la restituye.
- Free tier: ráfagas de llamadas devuelven 429 (`UPSTREAM_RATE_LIMITED`); en evals/pruebas manuales espaciar los pedidos.
- La regeneración por legibilidad recibe las palabras largas (≥ 4 sílabas) de la salida rechazada (`readability.long_words`);
  sin esa pista nemotron copia el texto o pierde cifras ("100 %" -> "todo"). `mustPreserve` entra al prompt de adapt (`$must_preserve`).
- Prompts activos (admin: classify v2 y planner v2, el resto v1): classify v2, easy_read v3, plain_language v3, okr_suggest v2, checkin_summary v2, judge v2, judge_suggest v1
  (las anteriores no se tocan; sin `active.yaml` rige la mayor).
- **Tier opcional `regenerate`** (`models.yaml`): modelo propio del paso REGENERATE (ultra, `timeout_s` 60); falta -> usa `generate`. Mismo
  `ResilientLlm` (retry + fallback + un `UsageStep` por intento con el modelo efectivo). `timeout_s` por tier sobreescribe `defaults.timeout_s`.
  ultra como generador PRIMARIO se descartó: latencia 1,3–>38 s en el free tier. Deadline por defecto 120 s (`AGENT_REQUEST_DEADLINE_S`;
  un `.env` viejo con 40 lo pisa: actualizarlo). El back debe esperar > 120 s (AGENT_TIMEOUT_MS=125000).
- **okr-suggest se juzga con `judge_suggest`, no con el juez de fidelidad**: una sugerencia DEBE cambiar la redacción; el juez de fidelidad
  la rechazaba por "agregar rationale/warnings" (VERIFICATION_FAILED y borrador devuelto igual). Además `preservation` exige `rationale`
  no vacío en objetivo y KRs. El eval `borrador-pobre` afirma que el resultado difiere del borrador, tiene rationale y conserva 8 -> 4.
- **Enums del contrato nunca llegan crudos al texto visible**: los specs traducen band/action/scoring/trend/type/cycleKind a español en las
  variables del prompt (`BAND_LABELS`, …) y `raw_enum_tokens` (RED, STOP, NOT_STARTED…) hace fallar la verificación -> regenera una vez ->
  respaldo. Un segmento adapt que es solo un token enum (`^[A-Z_]{3,}$`) no puede volver igual. Se ignoran tokens que ya estaban en el origen.
- El juez diffusiongemma (26B) da falsos UNFAITHFUL por tiempo verbal/paráfrasis (visto en checkin-summary) y a veces agota 20 s: judge v2
  lo instruye a no rechazar eso y el tier judge tiene `timeout_s` 30. `verify` loguea los motivos de cada regeneración/respaldo (INFO).

- **Jerga sin explicar (adapt)** (bug 2026-10-18: PLAIN dejó "pipeline calificado de 400000 USD" con glosario []): causas = prompts v2 con glosario
  "0 a 15" (opcional) + `find_acronyms` solo ve MAYÚSCULAS. Ahora easy_read/plain_language **v3** hacen el glosario obligatorio para toda jerga
  que quede, y `guards/jargon.unexplained_jargon` (lista curada `config/jargon.yaml`: sin mayúsculas/tildes, palabra entera, plural s/es,
  frases como "tasa de cierre"; explicada = en el glosario o con paréntesis) hace que `verify` regenere UNA vez con la lista de términos. Si
  sigue sin explicar: se devuelve la versión adaptada (NO el respaldo; es falla blanda) con `needsHumanReview=true`, `reviewReason=VERIFICATION_FAILED`
  (el contrato no tiene valor mejor; la jerga NO se mezcla en `unexplainedAcronyms`, cuyo contrato son "siglas 2+ mayúsculas"). Es chequeo interno:
  la forma del contrato no cambia. Sin heurística "parece inglés" (falsos positivos). No listar siglas en MAYÚSCULAS en el yaml (las cubre `find_acronyms`).
  Para extender: agregar una línea a `config/jargon.yaml` y reiniciar.
- **Miles es-AR**: `AdaptSpec.normalize` aplica `fidelity.format_thousands` (400000 -> 400.000, solo 5+ cifras sueltas; no toca años/fechas/decimales);
  `canonical_number` trata "400.000" == "400000" y "1.234,5" == "1234.5". nemotron ignora a veces la regla del prompt: por eso es determinista.
- El back cachea la adaptación por `sourceHash` = (segmentos, level, `EXPECTED_PROMPT_VERSION`='1' fija en `source-hash.ts`): cambiar el prompt del agente
  NO invalida borradores viejos hasta subir esa constante.

- **ADK tools + `include_contents="none"`** (extensión admin, modo tools): el LlmAgent del planner corre dentro de un `BaseAgent` propio; hay que **re-emitir (`yield`)
  sus eventos** al Runner (lo que persiste la sesión). Si se descartan (`async for _ in agent.run_async(ctx): pass`, como hace `structured_call` con agentes de una
  sola llamada) la 2da vuelta del bucle no ve sus propios `function_call`/`function_response`. Las herramientas son `async def` sin `await` (orden de registro
  = orden de emisión). Cada vuelta del bucle es una llamada nueva a `ResilientLlm` (arranca por el primario). `ResilientLlm` acepta respuestas con solo `function_call`.
- `planner`/`summarize` son tiers opcionales (si faltan, usan `generate`) y NO entran en el invariante de familia del juez (esos pipelines no juzgan).

- **Planes de ciclos / historial (bug asistente-planes)**: el planner v1 proponía QUARTER sin ANNUAL padre (y lo anotaba como supuesto) y reutilizaba el
  handle "C3" de un plan *propuesto* del historial (inexistente) tras 2 REPAIR. Causa: no conocía las reglas del dominio y trataba el texto de la conversación
  como catálogo. Fix: `admin_planner` v2 (reglas de dominio, solo handles del catálogo, lo de planes PROPUESTO/VENCIDO/INVÁLIDO no existe, ANNUAL primero con
  ref NEW), `admin_classify` v2 (seguimientos vagos => ACTION/CLARIFY, no QUERY), `local_checks._cycle_hierarchy_issues` (QUARTER sin padre / padre no ANNUAL /
  fuera de fechas / solapado, con datos del catálogo; código `DTO_INVALID`) y `_issues_note` (lista handles válidos y exige cambiar de estrategia). El back
  anota el historial con "[Plan PROPUESTO, todavía sin confirmar: nada de esto existe aún]" etc. Evals: `trimestre-*`, `repetir-plan-*`, `seguimiento-vago-*`
  (`catalogRemove` en el request del caso quita entidades del catálogo base).

## Tests

- `tests/unit` (guards, config, prompts, HMAC, ResilientLlm), `tests/api` (pipeline + endpoints con `TestClient`), `tests/contract`.
- Extensión admin: `tests/admin/` (chat plan schema+tools, otras intenciones, digest, help), `tests/unit/test_admin_*`, `tests/contract/test_admin_fixtures.py`; fixtures `ah`/`ah_tools`
  (Harness con tiers planner/summarize de IDs propios). Evals admin: `evals/admin_{plan,digest,help}.test.json` + `tests/evals/test_admin_evals.py`
  (`AGENT_PLANNER_MODE=schema|tools`, `EVAL_SLEEP_S`, `EVAL_RESULTS_FILE`).
- Nunca tocan la red: `tests/conftest.py` define `FakeLlm(BaseLlm)` guionado por ID de modelo (`Text`, `Hang` → timeout, `Boom`).
  El `Harness` usa `tests/fixtures/models.test.yaml` (IDs ficticios y distintos por rol), NO `config/models.yaml`: así cambiar los modelos reales no rompe los tests.
- `pytest -m eval` corre `evals/*.test.json` contra NVIDIA NIM real (exige `NVIDIA_NIM_API_KEY`; gasta tokens). Por defecto se deselecciona.
- Cada paso nuevo necesita sus caminos de falla testeados (timeout, JSON inválido + REPAIR, fallback, juez rechaza → regenerar una vez).

## Commits

Conventional commits en español, sin atribución de IA (`feat(agente): …`, `fix(agente): …`, `test(agente): …`).

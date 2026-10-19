# OKR Platform

Plataforma de gestión de OKRs para Flock IT, basada en *Measure What Matters* (John Doerr): objetivos y resultados clave comprometidos y aspiracionales, check-ins con score de 0,0 a 1,0, CFR (feedback privado y reconocimientos) y reporte PDF por equipo. Los resultados de OKRs están técnicamente desvinculados de cualquier esquema de compensación.

## IA dentro del producto

Un agente propio (Python, Google ADK + NVIDIA NIM) suma IA con supervisión humana:

- **Accesibilidad cognitiva (RD 707/2026)**: versiones en lectura fácil y lenguaje claro de objetivos, check-ins y feedback, con glosario y validación por una persona. Si hace falta otro formato, se pide un documento adaptado a una persona (art. 14.5) con plazo y rechazo justificado por escrito.
- **Ayudas para OKRs**: sugerir redacción de objetivos y KRs, y resumir el historial de check-ins.
- **Asistente de administración**: novedades del día calculadas por la API, consultas de auditoría, respuestas basadas en los manuales y acciones (crear usuarios, equipos, ciclos, objetivos y KRs) que el modelo solo **propone**: se ejecutan después de que el admin confirma el plan.
- **Medición y trazabilidad**: cada llamada al modelo queda en `LlmCall` (append-only) con tokens, latencia, costo estimado y versión de prompt; tablero "Uso de IA" para ADMIN.

El agente nunca toca la base de datos: la API decide permisos, minimiza los datos que envía y es la única que escribe. Detalle en [`docs/ai/README.md`](docs/ai/README.md).

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `apps/back` | API NestJS 11 + Prisma 6 + PostgreSQL (la app vive en `apps/back/okr-platform`) |
| `apps/front` | Next.js 16 (App Router) + React 19 + Tailwind 4, con el sistema de diseño Flock UI. Incluye la sección "Ayuda" y los manuales en `docs/manuales/` |
| `apps/agent` | Agente de IA (Python, Google ADK + LiteLLM → NVIDIA NIM); lo consume la API por HTTP con firma HMAC |
| `docs/design-system` | Guía de Flock UI (tokens, voz, componentes) |
| `docs/ai` | Contratos HTTP API ⇄ agente (`agent-contract.md`, `agent-contract-admin.md`) y resumen de la IA (checklist del AI Day, RD 707/2026) |
| `tools/demo` | Scripts para levantar una demo local con datos realistas |
| `tools/monorepo` | Script de sincronización de este monorepo |
| `spikes/pdf-json-render` | Prueba técnica del PDF con `@json-render/react-pdf` |

> Este monorepo es un **espejo**: el desarrollo ocurre en los repos fuente `okr-platform-back`, `okr-platform-front` y `okr-platform-agent`, y se sincroniza acá con `git subtree` conservando el historial completo. Cada app tiene su propio `CLAUDE.md` con arquitectura, reglas y comandos.

## Demo local

Requiere Docker y Node 22. Para la IA, además, Python 3.12+ y una API key de [build.nvidia.com](https://build.nvidia.com) (solo funcionan los modelos marcados "Free Endpoint"). En Windows (PowerShell):

```powershell
# IA (opcional): sin esto la demo corre igual, con la IA apagada
cd apps/agent
python -m venv .venv; .venv\Scripts\pip install -e ".[dev]"
copy .env.example .env            # completar NVIDIA_NIM_API_KEY; nunca commitear .env
cd ../..

./tools/demo/demo-up.ps1          # DB efímera :55435 + agente :8098 (si está configurado) + API :3100 + datos de ejemplo
cd apps/front; npm install
$env:API_URL="http://localhost:3100"; npx next dev -p 3101
./tools/demo/demo-down.ps1        # apaga todo
```

Front en http://localhost:3101 · Swagger en http://localhost:3100/api. Credenciales y qué probar en `tools/demo/README.md` (solo para la demo local).

## Tests

- Back: `cd apps/back/okr-platform && npx jest` (unitarios) y `npx jest --config ./test/jest-e2e.json --runInBand` con `docker compose up -d db-test`.
- Front: `cd apps/front && npx vitest run` y `npm run test:e2e:stack` (ver `apps/front/CLAUDE.md`).
- Agente: `cd apps/agent && .venv\Scripts\pytest` (sin red, LLM simulado); `pytest -m eval -s` corre las evals contra NVIDIA real.

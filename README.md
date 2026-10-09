# OKR Platform

Plataforma de gestión de OKRs para Flock IT, basada en *Measure What Matters* (John Doerr): objetivos y resultados clave comprometidos y aspiracionales, check-ins con score de 0,0 a 1,0, CFR (feedback privado y reconocimientos) y reporte PDF por equipo. Los resultados de OKRs están técnicamente desvinculados de cualquier esquema de compensación.

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `apps/back` | API NestJS 11 + Prisma 6 + PostgreSQL (la app vive en `apps/back/okr-platform`) |
| `apps/front` | Next.js 16 (App Router) + React 19 + Tailwind 4, con el sistema de diseño Flock UI |
| `docs/design-system` | Guía de Flock UI (tokens, voz, componentes) |
| `tools/demo` | Scripts para levantar una demo local con datos realistas |
| `tools/monorepo` | Script de sincronización de este monorepo |
| `spikes/pdf-json-render` | Prueba técnica del PDF con `@json-render/react-pdf` |

> Este monorepo es un **espejo**: el desarrollo ocurre en los repos fuente `okr-platform-back` y `okr-platform-front`, y se sincroniza acá con `git subtree` conservando el historial completo. Cada app tiene su propio `CLAUDE.md` con arquitectura, reglas y comandos.

## Demo local

Requiere Docker y Node 22. En Windows (PowerShell):

```powershell
./tools/demo/demo-up.ps1          # DB efímera :55435 + API :3100 + datos de ejemplo
cd apps/front; npm install
$env:API_URL="http://localhost:3100"; npx next dev -p 3101
./tools/demo/demo-down.ps1        # apaga todo
```

Front en http://localhost:3101 · Swagger en http://localhost:3100/api. Credenciales en `tools/demo/README.md` (solo para la demo local).

## Tests

- Back: `cd apps/back/okr-platform && npx jest` (unitarios) y `npx jest --config ./test/jest-e2e.json --runInBand` con `docker compose up -d db-test`.
- Front: `cd apps/front && npx vitest run` y `npm run test:e2e` (ver `apps/front/CLAUDE.md`).

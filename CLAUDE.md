@AGENTS.md

# CLAUDE.md

## Sub-Agentes por Módulo

Cada módulo/feature tendrá su propio `CLAUDE.md` en `src/app/(app)/<módulo>/CLAUDE.md` (rutas, componentes, hooks, dependencias).

**Cuándo usar un sub-agente:** si la tarea involucra principalmente un módulo, delegala a un sub-agente `general-purpose` con este prompt base:

```
Leé primero `src/app/(app)/<módulo>/CLAUDE.md` para entender el contexto del módulo.
Luego realizá la siguiente tarea: <descripción>
Al terminar, actualizá `src/app/(app)/<módulo>/CLAUDE.md` para reflejar los cambios.
```

**Módulos planificados** (se crean durante el SDD; actualizar esta tabla al crearlos):

| Módulo    | Ruta                                |
| --------- | ----------------------------------- |
| okrs      | `src/app/(app)/okrs/CLAUDE.md`      |
| check-ins | `src/app/(app)/check-ins/CLAUDE.md` |
| cfr       | `src/app/(app)/cfr/CLAUDE.md`       |
| auth      | `src/app/(auth)/CLAUDE.md`          |

---

# OKR Platform — Front

## Proyecto

Plataforma de gestión de OKRs: objetivos y resultados clave (comprometidos/aspiracionales), check-ins con scoring 0.0–1.0, y módulo CFR (conversaciones 1:1, feedback entre pares, reconocimientos). Consume la API NestJS de `../okr-platform-back`.

## Stack

- **Framework**: Next.js 16.4 (App Router, Turbopack, `cacheComponents`)
- **Lenguaje**: TypeScript 5 (`strict: true`, alias `@/* → ./src/*`)
- **UI**: Tailwind CSS 4 (sin config JS)
- **Estado**: a definir en SDD (por defecto: Server Components + fetch)
- **Datos**: REST contra la API NestJS (`okr-platform-back`)
- **Auth**: JWT emitido por el back

## Reglas de Desarrollo

- Next.js 16.4 tiene breaking changes: leer `node_modules/next/dist/docs/` antes de usar APIs (ver `AGENTS.md`).
- TypeScript `strict` — nunca `any` sin justificar; preferir `unknown` + narrowing.
- Server Components por defecto; `'use client'` solo en hojas interactivas.
- Skills de Vercel en `.claude/skills/`: `vercel-react-best-practices`, `vercel-composition-patterns`, `web-design-guidelines`.
- Pre-commit (Husky + lint-staged): Prettier + ESLint sobre archivos staged.

## Estructura

```
src/
└── app/
    ├── layout.tsx
    ├── page.tsx
    └── globals.css
test/      # setup y mocks de Vitest
e2e/       # specs de Playwright
```

## Comandos Principales

```bash
npm run dev        # next dev
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm run format     # prettier --write .
npm test           # vitest run (unit/componentes)
npm run test:watch # vitest en watch
npm run test:e2e   # playwright test (levanta next dev en :3001)
```

## Testing

Dos capas con responsabilidades separadas:

- **Vitest + React Testing Library** (`npm test`): unit/componentes/hooks y `src/lib` (DAL, helpers, spec del PDF). Tests junto al código: `*.test.ts(x)` en `src/`. Entorno jsdom, setup en `test/setup.ts`, config en `vitest.config.mts`. No soporta Server Components `async`: esos se cubren con E2E.
- **Playwright** (`npm run test:e2e`): flujos E2E en `e2e/*.spec.ts`. `playwright.config.ts` levanta `next dev` en el puerto **3001** (el back usa 3000 y su `FRONT_ORIGIN` es `http://localhost:3001`). Requiere `npx playwright install chromium` la primera vez.
- Vitest solo incluye `src/**` y `test/**`; Playwright solo `e2e/**`. No mezclar.
- Mocks de Vitest en `test/mocks/`: `server-only` (no-op) y `next/headers` (stub con `__setCookies`/`__setHeaders`), aliasados en `vitest.config.mts`.

## Reglas de Negocio Importantes

- 3 a 5 Objetivos por ciclo, 3 a 5 Resultados Clave por objetivo.
- Score 0.0–1.0: verde 0.7–1.0, amarillo 0.4–0.6, rojo 0.0–0.3.
- Comprometidos esperan 1.0; aspiracionales se consideran éxito en 0.6–0.7.
- Los resultados de OKRs NUNCA se vinculan a compensación/bonos.
- Ciclos anuales (estratégicos) y trimestrales/mensuales (tácticos) conectados.

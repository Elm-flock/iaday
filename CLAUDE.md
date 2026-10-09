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

| Módulo         | Ruta                                              |
| -------------- | ------------------------------------------------- |
| objetivos      | `src/app/(app)/objetivos/CLAUDE.md` (creado)      |
| check-ins      | `src/app/(app)/check-ins/CLAUDE.md`               |
| cfr            | `src/app/(app)/cfr/CLAUDE.md`                     |
| auth           | `src/app/(auth)/CLAUDE.md` (creado)               |
| ciclos         | `src/app/(app)/ciclos/CLAUDE.md` (creado)         |
| equipos        | `src/app/(app)/equipos/CLAUDE.md` (creado)        |
| admin/usuarios | `src/app/(app)/admin/usuarios/CLAUDE.md` (creado) |

---

# OKR Platform — Front

## Proyecto

Plataforma de gestión de OKRs: objetivos y resultados clave (comprometidos/aspiracionales), check-ins con scoring 0.0–1.0, y módulo CFR (conversaciones 1:1, feedback entre pares, reconocimientos). Consume la API NestJS de `../okr-platform-back`.

## Stack

- **Framework**: Next.js 16.4 (App Router, Turbopack, `cacheComponents`)
- **Lenguaje**: TypeScript 5 (`strict: true`, alias `@/* → ./src/*`)
- **UI**: Tailwind CSS 4 (sin config JS) + Flock UI propio (ver Sistema de diseño), lucide-react
- **Estado**: a definir en SDD (por defecto: Server Components + fetch)
- **Datos**: REST contra la API NestJS (`okr-platform-back`)
- **Auth**: JWT emitido por el back, guardado en cookies httpOnly (`okr_at`/`okr_rt`); Next actúa de BFF (ver `src/app/(auth)/CLAUDE.md`)
- **Env**: `API_URL` (server-only, default `http://localhost:3000`)

## Reglas de Desarrollo

- Next.js 16.4 tiene breaking changes: leer `node_modules/next/dist/docs/` antes de usar APIs (ver `AGENTS.md`).
- TypeScript `strict` — nunca `any` sin justificar; preferir `unknown` + narrowing.
- Server Components por defecto; `'use client'` solo en hojas interactivas.
- Skills de Vercel en `.claude/skills/`: `vercel-react-best-practices`, `vercel-composition-patterns`, `web-design-guidelines`.
- Pre-commit (Husky + lint-staged): Prettier + ESLint sobre archivos staged.

## Sistema de diseño

Flock UI implementado de forma nativa sobre Tailwind 4 (sin bundle `fk-*`, sin `window.FlockUI`). Referencia completa y catálogo de componentes (P1/P2/P3): `docs/design-system.md`. Catálogo visual en dev: `/ui` (`src/app/(dev)/ui`, 404 en producción).

- **Tokens** en `src/app/globals.css`: variables CSS claro (default) / oscuro (clase `.dark`), expuestas con `@theme` como utilidades: `bg-surface`, `text-ink`, `text-ink-muted`, `border-border`, `bg-primary`, `text-primary-text`, `bg-success-subtle`, `rounded-pill|lg|md|sm`, `p-s10|s15|s20|s30|s40`, `shadow-sm|overlay`, `text-body|body-sm|caption|button|heading-1..3|display`, `bg-horizonte|brasa|noche`. No inventar colores fuera de los tokens; no usar `dark:` (los tokens ya cambian con el tema).
- **Componentes** en `src/components/ui/<nombre>.tsx` (importar directo, sin barrel). Server Components salvo los interactivos (`'use client'`: Modal, Drawer, ConfirmDialog, Toast, AppShell/Sidebar, FormField y controles). `cn()` en `src/lib/cn.ts` (clsx + tailwind-merge configurado con los tokens: al agregar un token de texto/espaciado, registrarlo ahí). Variantes explícitas por mapa de clases, sin `class-variance-authority`.
- **Reglas**: voz es-AR con voseo y sentence case; una sola acción primaria por vista; pill = acción, `radius-lg` = contenedor, `radius-md` = campo; el estado nunca va solo en color (ícono + palabra: `BandBadge` → En ruta / Requiere atención / En riesgo); íconos Lucide con trazo 1.75; foco visible (anillo 2px `focus`); movimiento 150–200 ms y `prefers-reduced-motion`; acciones sin permiso deshabilitadas con explicación; degradés solo en superficies de marca (login, PDF).
- **Formato AR** en `src/lib/format.ts`: `formatNumber` (1.234,56), `formatScore` (0,70), `formatPercent` (70 %), `formatDate` (dd/mm/aaaa), `formatTime` (24 h, Buenos Aires).
- **Tipografía**: Public Sans (next/font, 300/400/700) como respaldo de Tomato Grotesk; títulos en 300 con tracking.

## Estructura

```
src/
├── proxy.ts                  # auth optimista + refresh silencioso (Node runtime)
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── (auth)/               # login, actions (login/logout) → CLAUDE.md
│   ├── (app)/                # shell autenticado (AppShell + UserMenu), Inicio
│   └── (dev)/ui/             # catálogo de componentes (solo dev)
├── components/ui/            # Flock UI
└── lib/
    ├── api/                  # cliente openapi-fetch, schema.d.ts generado, errores
    ├── auth/                 # cookies, safeNext, token
    ├── actions/              # FormState + useActionForm (forms sin reset tras la action)
    └── dal/                  # acceso a datos server-only (session, cycles, teams, users, objectives)
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
npm run test:e2e   # playwright test (levanta next dev en :3001; auth requiere el back real)
npm run api:types  # regenera src/lib/api/schema.d.ts desde ../okr-platform-back/okr-platform/openapi.json
```

## Testing

Dos capas con responsabilidades separadas:

- **Vitest + React Testing Library** (`npm test`): unit/componentes/hooks y `src/lib` (DAL, helpers, spec del PDF). Tests junto al código: `*.test.ts(x)` en `src/`. Entorno jsdom, setup en `test/setup.ts`, config en `vitest.config.mts`. No soporta Server Components `async`: esos se cubren con E2E.
- **Playwright** (`npm run test:e2e`): flujos E2E en `e2e/*.spec.ts`. `playwright.config.ts` levanta `next dev` en el puerto **3001** (el back usa 3000 y su `FRONT_ORIGIN` es `http://localhost:3001`). Requiere `npx playwright install chromium` la primera vez.
- Los e2e de auth necesitan el back corriendo (`API_URL`, default `:3000`) con un admin sembrado (`E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`). Ver `src/app/(auth)/CLAUDE.md`.
- Vitest solo incluye `src/**` y `test/**`; Playwright solo `e2e/**`. No mezclar.
- Mocks de Vitest en `test/mocks/`: `server-only` (no-op) y `next/headers` (stub con `__setCookies`/`__setHeaders`), aliasados en `vitest.config.mts`.

## Reglas de Negocio Importantes

- 3 a 5 Objetivos por ciclo, 3 a 5 Resultados Clave por objetivo.
- Score 0.0–1.0: verde 0.7–1.0, amarillo 0.4–0.6, rojo 0.0–0.3.
- Comprometidos esperan 1.0; aspiracionales se consideran éxito en 0.6–0.7.
- Los resultados de OKRs NUNCA se vinculan a compensación/bonos.
- Ciclos anuales (estratégicos) y trimestrales/mensuales (tácticos) conectados.

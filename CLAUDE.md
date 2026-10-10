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

| Módulo          | Ruta                                               |
| --------------- | -------------------------------------------------- |
| objetivos       | `src/app/(app)/objetivos/CLAUDE.md` (creado)       |
| check-ins       | `src/app/(app)/check-ins/CLAUDE.md` (creado)       |
| feedback        | `src/app/(app)/feedback/CLAUDE.md` (creado)        |
| reconocimientos | `src/app/(app)/reconocimientos/CLAUDE.md` (creado) |
| auth            | `src/app/(auth)/CLAUDE.md` (creado)                |
| ciclos          | `src/app/(app)/ciclos/CLAUDE.md` (creado)          |
| equipos         | `src/app/(app)/equipos/CLAUDE.md` (creado)         |
| admin/usuarios  | `src/app/(app)/admin/usuarios/CLAUDE.md` (creado)  |
| inicio          | `src/app/(app)/CLAUDE.md` (creado)                 |

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
- **Reglas**: voz es-AR con voseo y sentence case; una sola acción primaria por vista; pill = acción, `radius-lg` = contenedor, `radius-md` = campo; el estado nunca va solo en color (ícono + palabra: `BandBadge` → En ruta / Requiere atención / En riesgo; sin check-ins no hay banda: `NoCheckInsBadge` "Sin check-ins" / `OverdueBadge`); íconos Lucide con trazo 1.75; foco visible (anillo 2px `focus`); movimiento 150–200 ms y `prefers-reduced-motion`; acciones sin permiso deshabilitadas con explicación; degradés solo en superficies de marca (login, PDF).
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
    ├── pdf/                  # reporte PDF del equipo (json-render + react-pdf): ver sección Reporte PDF
    ├── actions/              # FormState + useActionForm (forms sin reset tras la action)
    └── dal/                  # acceso a datos server-only (session, cycles, teams, users, objectives, check-ins, recognitions; feedback SIN cache)
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
npm run test:e2e   # playwright test (levanta next dev en :3001; requiere el back e2e ya levantado)
npm run test:e2e:stack # levanta db+API e2e, corre playwright y lo baja todo
npm run e2e:stack -- up   # (o down) solo el stack e2e del back
npm run api:types  # regenera src/lib/api/schema.d.ts desde ../okr-platform-back/okr-platform/openapi.json
```

## Testing

Dos capas con responsabilidades separadas:

- **Vitest + React Testing Library** (`npm test`): unit/componentes/hooks y `src/lib` (DAL, helpers, spec del PDF). Tests junto al código: `*.test.ts(x)` en `src/`. Entorno jsdom, setup en `test/setup.ts`, config en `vitest.config.mts`. No soporta Server Components `async`: esos se cubren con E2E.
- **Playwright** (`npm run test:e2e`): E2E contra el back REAL en `e2e/*.spec.ts` (módulos), `e2e/journeys/*.spec.ts` (recorridos de punta a punta por rol), `e2e/a11y.spec.ts` y `e2e/teclado-a11y.spec.ts` (axe en claro/oscuro, teclado, diálogos). `playwright.config.ts` levanta `next dev` en **3001** (el back usa 3000 y su `FRONT_ORIGIN` es `http://localhost:3001`), usa 4 workers y un `globalSetup` que calienta las rutas (dev compila bajo demanda). Primera vez: `npx playwright install chromium`.
- **Cómo correr los e2e (un solo comando)**: `npm run test:e2e:stack` (= `scripts/e2e-stack.mjs run`) levanta `db-test` (compose project `okr-e2e-front`, puerto 55434), `prisma migrate deploy` + seed del admin, la API con `ts-node` en :3000 (NUNCA `nest start`/`build`), corre Playwright y lo baja todo (`compose down -v`) aunque falle. Por pasos: `npm run e2e:stack -- up`, `npx playwright test [archivo]`, `npm run e2e:stack -- down`. Requiere Docker y el back en `../okr-platform-back` (`E2E_BACK_DIR`, `DB_TEST_PORT`, `API_PORT` para cambiarlo). El script solo EJECUTA el back, no lo modifica.
- El admin sembrado sale de `e2e/helpers/admin.json` (única fuente: la usan el seed del script y los specs; no hacen falta variables extra). Helpers compartidos en `e2e/helpers/index.ts` (login por API/UI, sesiones aisladas por usuario, ciclos/equipos/objetivos por API, `createObjectiveUi`, `addKeyResultUi`, `checkInUi`). Cada spec crea datos propios con sufijo único y años aleatorios.
- Gotchas e2e: con Cache Components las páginas previas siguen ocultas en el DOM (React Activity): usar `filter({ visible: true })` o acotar al `nav` (`navLink`). El botón de la vista y el submit del modal pueden llamarse igual: esperar a que el diálogo se cierre antes de seguir. Con más de 6 workers `next dev` y la API (argon2) se saturan y las Server Actions superan el timeout: no subir los workers. `next.config.ts` excluye el CSS `foreign` del loader de Tailwind; sin eso, con `.next` vacío el dev server no compila `next/font/google`.
- Vitest solo incluye `src/**` y `test/**`; Playwright solo `e2e/**`. No mezclar.
- Mocks de Vitest en `test/mocks/`: `server-only` (no-op) y `next/headers` (stub con `__setCookies`/`__setHeaders`), aliasados en `vitest.config.mts`.

## Reporte PDF (`src/lib/pdf/`)

PDF del equipo por ciclo con `@json-render/core` + `@json-render/react-pdf` **fijados en 0.21.0 (exactos, sin `^`)** y `zod` 4.6.5 (peer obligatorio). Se eligió json-render (ronda 9, tras el spike 9.1) para que el spec sea JSON testeable sin renderizar. Es pre-1.0 y saca minors rápido: no actualizar sin re-correr los tests y mirar el PDF. `@react-pdf/renderer` está declarado y **fijado en 4.9.0 (exacto)** porque `registry.tsx`/`fonts.ts` lo importan directo (antes era una dependencia fantasma transitiva de json-render). `npm ls @react-pdf/renderer` debe mostrarlo deduplicado bajo `@json-render/react-pdf` (una sola instancia: dos copias romperían el registro de fuentes y los componentes). Al subir `@json-render/react-pdf`, subir este en conjunto y verificar el dedupe.

| Archivo                                     | Rol                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `team-report-spec.ts`                       | PURO: `TeamReportDto` -> `Spec`. Textos ya formateados (es-AR, voseo). Personas en orden alfabético (colación `es`), NUNCA por score. Sin `lastCheckInAt` = badge neutro "Sin check-ins" (objetivo neutro si ningún KR tiene check-ins). Mezcla de origen con aviso suave fuera de 40–60 %.                                                        |
| `registry.tsx`                              | Componentes custom: `Page` (reemplaza al estándar que fija Helvetica; pie fijo "Página X de Y"), `BrandHeader` (degradé "Noche" con `Svg LinearGradient`), `OriginMix`, `ObjectiveBlock` (`wrap={false}`), `SectionTitle` (`minPresenceAhead`). Estado = ícono SVG + palabra (Public Sans no trae ●▲). Mapa plano sin tipar (no `defineRegistry`). |
| `fonts.ts`                                  | `registerPdfFonts()` idempotente, Public Sans 300/400/700. react-pdf solo acepta `.woff`/`.ttf` (NO woff2).                                                                                                                                                                                                                                        |
| `fonts/*.woff`                              | Copiados de `@fontsource/public-sans` 5.3.0 (OFL) y versionados en el repo: así no dependen de `node_modules` en el deploy; `next.config.ts` los incluye con `outputFileTracingIncludes` para la ruta del PDF.                                                                                                                                     |
| `render-team-report-pdf.ts`                 | Adaptador: ÚNICO archivo que importa el render de json-render; devuelve `Buffer` (`Buffer.from(Uint8Array)`). Cambiar de motor toca solo este archivo.                                                                                                                                                                                             |
| `slug.ts`, `report-types.ts`, `fixtures.ts` | Nombre de archivo, tipos del schema y fixtures de tests.                                                                                                                                                                                                                                                                                           |

- Cualquier símbolo fuera de Latin-1 en el texto del PDF (flechas, viñetas Unicode) cae a Helvetica o se rompe: usar solo Latin-1 (`·` está bien).
- `@react-pdf/renderer` ya está en la lista de externos por defecto de Next, así que NO hizo falta `serverExternalPackages`.
- **Riesgo conocido**: verificado solo en `next dev` (Turbopack). Nunca se corrió `next build`; el primer build debe re-verificar que el PDF sale y que los `.woff` están en el trace (si falla el bundling: `serverExternalPackages: ['@react-pdf/renderer']`).
- Tests: `team-report-spec.test.ts` (puro), `render-team-report-pdf.test.ts` (`// @vitest-environment node`, el Buffer empieza con `%PDF`), `route.test.ts` del handler y `e2e/reporte-equipo.spec.ts`.

## Reglas de Negocio Importantes

- 3 a 5 Objetivos por ciclo, 3 a 5 Resultados Clave por objetivo.
- Score 0.0–1.0: verde 0.7–1.0, amarillo 0.4–0.6, rojo 0.0–0.3.
- Comprometidos esperan 1.0; aspiracionales se consideran éxito en 0.6–0.7.
- Los resultados de OKRs NUNCA se vinculan a compensación/bonos.
- Ciclos anuales (estratégicos) y trimestrales/mensuales (tácticos) conectados.

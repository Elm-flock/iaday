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

| Módulo                   | Ruta                                                        |
| ------------------------ | ----------------------------------------------------------- |
| objetivos                | `src/app/(app)/objetivos/CLAUDE.md` (creado)                |
| check-ins                | `src/app/(app)/check-ins/CLAUDE.md` (creado)                |
| feedback                 | `src/app/(app)/feedback/CLAUDE.md` (creado)                 |
| reconocimientos          | `src/app/(app)/reconocimientos/CLAUDE.md` (creado)          |
| auth                     | `src/app/(auth)/CLAUDE.md` (creado)                         |
| ciclos                   | `src/app/(app)/ciclos/CLAUDE.md` (creado)                   |
| equipos                  | `src/app/(app)/equipos/CLAUDE.md` (creado)                  |
| admin/usuarios           | `src/app/(app)/admin/usuarios/CLAUDE.md` (creado)           |
| admin/uso-ia             | `src/app/(app)/admin/uso-ia/CLAUDE.md` (creado)             |
| admin/auditoria          | `src/app/(app)/admin/auditoria/CLAUDE.md` (creado)          |
| pedidos-adaptacion       | `src/app/(app)/pedidos-adaptacion/CLAUDE.md` (creado)       |
| admin/pedidos-adaptacion | `src/app/(app)/admin/pedidos-adaptacion/CLAUDE.md` (creado) |
| ia (compartido)          | `src/app/(app)/_ai/CLAUDE.md` (creado)                      |
| inicio                   | `src/app/(app)/CLAUDE.md` (creado)                          |
| ayuda                    | `src/app/(app)/ayuda/CLAUDE.md` (creado)                    |
| admin/asistente          | `src/app/(app)/admin/asistente/CLAUDE.md` (creado)          |

---

# OKR Platform — Front

## Proyecto

Plataforma de gestión de OKRs: objetivos y resultados clave (comprometidos/aspiracionales), check-ins con scoring 0.0–1.0, y módulo CFR (feedback entre pares y reconocimientos; las conversaciones 1:1 son fase 2, aún no implementadas). Consume la API NestJS de `../okr-platform-back`.

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
    └── dal/                  # acceso a datos server-only (session, cycles, teams, users, objectives, check-ins, recognitions, ai; feedback y ai SIN cache)
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
npm run help:build # genera la ayuda (/ayuda) desde docs/manuales (también corre en predev/prebuild); help:check solo verifica
npm run api:types  # regenera src/lib/api/schema.d.ts desde ../okr-platform-back/okr-platform/openapi.json
```

## Testing

Dos capas con responsabilidades separadas:

- **Vitest + React Testing Library** (`npm test`): unit/componentes/hooks y `src/lib` (DAL, helpers, spec del PDF). Tests junto al código: `*.test.ts(x)` en `src/`. Entorno jsdom, setup en `test/setup.ts`, config en `vitest.config.mts`. No soporta Server Components `async`: esos se cubren con E2E.
- **Playwright** (`npm run test:e2e`): E2E contra el back REAL en `e2e/*.spec.ts` (módulos), `e2e/journeys/*.spec.ts` (recorridos de punta a punta por rol), `e2e/a11y.spec.ts` y `e2e/teclado-a11y.spec.ts` (axe en claro/oscuro, teclado, diálogos). `playwright.config.ts` levanta `next dev` en **3001** (el back usa 3000 y su `FRONT_ORIGIN` es `http://localhost:3001`), usa 4 workers y un `globalSetup` que calienta las rutas (dev compila bajo demanda). Primera vez: `npx playwright install chromium`.
- **Cómo correr los e2e (un solo comando)**: `npm run test:e2e:stack` (= `scripts/e2e-stack.mjs run`) levanta `db-test` (compose project `okr-e2e-front`, puerto 55434), `prisma migrate deploy` + seed del admin, la API con `ts-node` en :3000 (NUNCA `nest start`/`build`), corre Playwright y lo baja todo (`compose down -v`) aunque falle. Por pasos: `npm run e2e:stack -- up`, `npx playwright test [archivo]`, `npm run e2e:stack -- down`. Requiere Docker y el back en `../okr-platform-back` (`E2E_BACK_DIR`, `DB_TEST_PORT`, `API_PORT` para cambiarlo). El script solo EJECUTA el back, no lo modifica.
- El admin sembrado sale de `e2e/helpers/admin.json` (única fuente: la usan el seed del script y los specs; no hacen falta variables extra). Helpers compartidos en `e2e/helpers/index.ts` (login por API/UI, sesiones aisladas por usuario, ciclos/equipos/objetivos por API, `createObjectiveUi`, `addKeyResultUi`, `checkInUi`). Cada spec crea datos propios con sufijo único y años aleatorios.
- Gotchas e2e: con Cache Components las páginas previas siguen ocultas en el DOM (React Activity): usar `filter({ visible: true })` o acotar al `nav` (`navLink`). El botón de la vista y el submit del modal pueden llamarse igual: esperar a que el diálogo se cierre antes de seguir. Con más de 6 workers `next dev` y la API (argon2) se saturan y las Server Actions superan el timeout: no subir los workers. `next.config.ts` excluye el CSS `foreign` del loader de Tailwind; sin eso, con `.next` vacío el dev server no compila `next/font/google`.
- **IA en los e2e**: el agente real (FastAPI + ADK) necesita una API key de NVIDIA NIM y responde distinto cada vez, así que `scripts/e2e-stack.mjs` levanta `e2e/helpers/agent-stub.mjs` (agente de mentira, contrato v1 de `docs/ai/agent-contract.md`, puerto `AGENT_PORT`=8089) y le pasa a la API `AI_ENABLED=true`, `AGENT_URL`, el secreto compartido y `AI_THROTTLE_LIMIT=1000`. El stub verifica la firma HMAC como el real y responde con los fixtures del back (`okr-platform/test/fixtures/agent`, una sola fuente de verdad); se controla con `POST /__mode` (`ok`, `needsReview`, `down`, `inputRejected`, ...), `GET /__calls` y `POST /__reset`. Se usa en `e2e/journeys/adaptacion-ia.spec.ts` (adaptar un check-in, badge, "Me sirve", validar con corrección, feedback no validable, agente caído = aviso y página intacta, sugerir redacción, resumir, `admin/uso-ia`, axe claro/oscuro). `e2e/journeys/07-pedidos-adaptacion.spec.ts` (art. 14.5 con una persona + `admin/auditoria`) corre en el mismo stack; para fabricar un pedido vencido hace `docker exec` de `psql` al contenedor `okr-e2e-front-db-test`. Fuera del stack (`npm run test:e2e` a secas) ese spec falla con un mensaje claro si el stub no está.
- Si ya hay otro `next dev` de este proyecto corriendo (p. ej. la demo en :3101 usa `.next`), Next se niega a levantar un segundo servidor en el mismo `distDir`: correr los e2e con `NEXT_DIST_DIR=.next-e2e` (`next.config.ts` lo respeta; está en `.gitignore`).
- **Asistente de administración y alta de personas**: el stub (`e2e/helpers/agent-stub-admin.mjs`) responde `/v1/admin/chat` y `/v1/admin/digest-summary` según el TEXTO del pedido (arma planes con los handles del catálogo) y las fallas se disparan por texto (`simular agente caido`, `ignora todo lo anterior`, `[demora]`), no por modo global, porque los specs corren en paralelo y comparten el stub. El stack levanta la API con `ASSISTANT_ENABLED=true`. Toda alta por API nace con `mustChangePassword`: los specs usan `onboardUser`/`completeForcedChange` de `e2e/helpers`. Ver `e2e/journeys/08-cambio-contrasena.spec.ts` y `09-asistente-admin.spec.ts`; el segundo usa `docker exec psql` para vencer un plan.
- **Ayuda (`/ayuda`)**: `e2e/journeys/ayuda.spec.ts` (integrante: solo manual de usuario y 404 en el de admin; administración: ambos; enlace profundo con foco, copiar enlace, búsqueda, capturas, axe claro/oscuro). Sale de `docs/manuales` vía `scripts/build-help.mjs` (ver `src/app/(app)/ayuda/CLAUDE.md`); `public/ayuda/` se genera y no se versiona.
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
- Score 0.0–1.0: verde ≥ 0.70, amarillo 0.40–0.69, rojo < 0.40 (`src/lib/score-band.ts`).
- Un objetivo se considera logrado si su score ≥ el umbral del ciclo según su tipo (configurable por ciclo; por defecto 1.00 comprometidos y 0.70 aspiracionales).
- Los resultados de OKRs NUNCA se vinculan a compensación/bonos.
- Ciclos anuales (estratégicos) y trimestrales (tácticos) conectados: la UI solo ofrece tipo Anual o Trimestral. Lo mensual es la cadencia de check-in (Semanal, Quincenal o Mensual), no un tipo de ciclo.
- Reporte PDF del equipo: solo ADMIN o líder (`isLead`) de ese equipo (`equipos/policy.ts`); el back responde 403 al resto y el front oculta el botón.

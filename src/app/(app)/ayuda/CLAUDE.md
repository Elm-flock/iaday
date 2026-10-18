# Módulo ayuda

`/ayuda` (buscador + manuales del rol) y `/ayuda/[manual]` (`usuario` | `admin`). Todo el contenido se genera en build/dev desde `docs/manuales/*.md`; no hay parser de Markdown en el cliente. Integrante y líder: solo el manual de usuario; ADMIN: ambos. El manual de administración responde `notFound()` al resto (la página es dinámica: sesión dentro de `<Suspense>`, el contenido sale del servidor DESPUÉS del chequeo). "Ayuda" está en el menú para todos (`_components/nav-items.ts`, sin `adminOnly`).

## Pipeline (ver `docs/manuales/README.md`)

`scripts/build-help.mjs` (lógica en `scripts/help/lib.mjs`, `marked` 18.0.14 + `github-slugger` 2.0.0 fijados, devDependencies) -> `_generated/help.generated.json` (versionado) + `docs/manuales/help-index.json` (para el asistente del back) + `public/ayuda/img/*.png` (copiadas de `docs/manual/img`, gitignored). Corre en `predev`/`prebuild`; `npm run help:check` verifica sin escribir. Si editás un manual: `npm run help:build` y subí los JSON (el test `help-build.test.ts` falla si quedaron viejos).

Decisiones:

- AST propio en vez de HTML: el HTML crudo del Markdown se degrada a texto, los enlaces solo `#ancla` / `/ayuda/...` / http(s) / mailto, las imágenes solo `../manual/img/*.png`; un `#ancla` rota o una captura faltante rompen el build.
- Capturas: copiadas a `public/ayuda/img` (no importadas) y servidas con `next/image` (ancho/alto sacados del PNG en build, sin layout shift). El proxy excluye `.png` del chequeo de sesión: las capturas usan datos de la demo.
- Slug: github-slugger (conserva tildes/ñ; ver README de manuales). IDs de sección: `<manual>#<ancla>`.
- Búsqueda: formulario GET `?q=` resuelto en el servidor (`search.ts`: sin tildes, todas las palabras, títulos primero, máx. 20). Cero JS de búsqueda en el cliente.

## Archivos

| Archivo                          | Rol                                                                                                                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `help-data.ts`                   | Tipos del AST, `HELP` (JSON generado, SOLO servidor), `manualsForRole`, `findManual`, `helpHref`.                                 |
| `search.ts`, `messages.ts`       | Búsqueda pura y textos es-AR.                                                                                                     |
| `page.tsx`, `[manual]/page.tsx`  | Contenedores server en `<Suspense>`: sesión + rol.                                                                                |
| `_components/help-views.tsx`     | Presentacionales (`HelpHomeView`, `ManualView`): testeables con RTL.                                                              |
| `_components/manual-content.tsx` | Render del AST con React (sin `dangerouslySetInnerHTML`). El H1 del manual no se repite (es el h1 de la página); H2 h2, H3 h3.    |
| `_components/manual-toc.tsx`     | Índice H2/H3 (`nav` con nombre, sticky en pantallas anchas).                                                                      |
| `_components/help-client.tsx`    | ÚNICA isla de cliente: foco en el título al cargar/cambiar `#`, copiar enlace (delegado en `[data-copy-anchor]`) y `PrintButton`. |

## Accesibilidad

Un solo h1; títulos con `tabIndex=-1` y foco programático al navegar por ancla; saltos "Saltar al contenido del manual" / "Ir al índice"; tablas en región enfocable con `th scope=col`; capturas con alt; copiar enlace con aviso `role=status`; impresión sin menú ni cabecera (`print:hidden` en `Header`, `Sidebar` y `AppShell print:block`).

## Tests

`help-build.test.ts` (slug, sanitizado, secciones, generado NO viejo, índice, enlaces de la app a la ayuda), `search.test.ts`, `help-views.test.tsx` (por rol, TOC, tablas, foco/copiar), nav en `_components/app-nav.test.tsx`; e2e `e2e/journeys/ayuda.spec.ts`. El panel de IA enlaza "¿Qué es la lectura fácil?" a `HELP_EASY_READ_HREF` (`_ai/messages.ts`); su ancla la verifica `help-build.test.ts`.

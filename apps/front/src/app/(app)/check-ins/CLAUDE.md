# Módulo check-ins

Registro de avances de los resultados clave y vista "Pendientes" (`/check-ins`). El registro se hace desde la fila del KR en `/objetivos/[id]` (y desde Pendientes) en un `Drawer`; el historial de cada KR se muestra en el detalle del objetivo.

## Archivos

| Archivo                                                          | Rol                                                                                                                                                                                                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page.tsx`                                                       | "Pendientes": mis KRs vencidos (`GET /check-ins/pending`, incluye los de equipo si soy líder) agrupados por objetivo. Trae cada objetivo (cacheado) en paralelo para tener los datos del KR que necesita el formulario. |
| `actions.ts`                                                     | `createCheckInAction(target, prev, formData)`: valida (`check-in-form-data.ts`), `POST /key-results/:id/check-ins`, invalida `okrs`, `objective:{id}`, `kr:{id}` y `check-ins:pending`.                                 |
| `messages.ts`                                                    | Acciones (Continuar/Actualizar/Iniciar/Detener con ayuda), razones de deshabilitado y copy es-AR por código del back (`OBJECTIVE_NOT_PUBLISHED`, `OBJECTIVE_CLOSED`, `CYCLE_CLOSED`, `CHECKIN_*`).                      |
| `check-in-form-data.ts`                                          | Parseo puro: DERIVED → `value` (decimal es-AR a string); MANUAL → `manualScore` 0–1 en pasos de 0,1; nota ≤ 2000.                                                                                                       |
| `policy.ts`                                                      | Espejo de `canCheckIn` del back (responsable del KR, del objetivo o integrante del equipo responsable; **sin atajo ADMIN**) y `checkInAvailability` (borrador / cerrado / sin permiso → razón visible).                 |
| `_components/check-in-drawer.tsx`                                | Hoja cliente: formulario con `useActionForm`, acción, valor/puntaje, **preview de score + banda** (`previewCheckIn`) y nota.                                                                                            |
| `_components/register-check-in-button.tsx`, `check-in-target.ts` | Botón "Registrar check-in" (abre el drawer, deshabilitado con `aria-describedby` a la razón) y los datos serializables del KR.                                                                                          |
| `_components/check-in-timeline.tsx`, `kr-history-card.tsx`       | Presentacionales: historial por KR (dd/mm/aaaa hh:mm, autor, acción, valor → score + banda, nota).                                                                                                                      |
| `_components/pending-list-view.tsx`                              | Presentacional: grupos por objetivo, vencido + último check-in/publicación, estado vacío "Estás al día con tus check-ins.".                                                                                             |

## Reglas

- DAL: `src/lib/dal/check-ins.ts` (`'use cache: private'`; `listPendingCheckIns` tag `check-ins:pending`, `listKrCheckIns` tags `okrs` + `kr:{id}`).
- Matemática del preview en `src/lib/check-in-preview.ts` (espejo del back): `clamp((actual - inicio) / (meta - inicio), 0, 1)` redondeado a 4 decimales; funciona con meta < inicio. Banda con `scoreBand`.
- **Estado neutro**: un KR/objetivo sin check-ins (`hasCheckIns=false`) muestra "Sin check-ins" (gris, ícono + palabra) en lugar de banda y sin barra de score; si está `overdue`, "Check-in vencido". Con datos: banda verde/amarilla/roja (y aviso de vencido aparte). Los componentes están en `components/ui/status-badge.tsx` (`NoCheckInsBadge`, `OverdueBadge`) y se componen en `objetivos/_components/progress-badge.tsx` (`KrProgressBadge`, `ObjectiveProgressBadge`). Un objetivo está vencido si algún KR lo está (el DTO del objetivo no trae `overdue`).
- La acción "Registrar check-in" no se oculta sin permiso: queda deshabilitada y la razón se ve en pantalla.
- El nav "Check-ins" muestra un contador de pendientes (8.5): se pide dentro de `AppNavWithRole`, que ya está en su `<Suspense>` del layout, así que el shell sigue estático (ver `src/app/(app)/CLAUDE.md`).

## Tests

`check-ins-logic.test.ts` (parseo, políticas, copy), `actions.test.ts` (fetch mockeado, `updateTag`), `_components/check-ins-views.test.tsx` (drawer: preview, meta < inicio, clamp, manual, error; timeline; pendientes), `src/lib/check-in-preview.test.ts`, `src/lib/dal/check-ins.test.ts`, `objetivos/_components/progress-badge.test.tsx`; e2e contra el back real en `e2e/check-ins.spec.ts` (el "vencido" se siembra retrasando `publishedAt` con `docker exec ... psql` en la base e2e).

## Ayuda de IA (ver `_ai/CLAUDE.md`)

- `CheckInTimeline` y `KrHistoryCard` siguen siendo presentacionales: aceptan las ranuras opcionales `renderExtra` / `renderCheckInExtra` (bajo cada check-in) y `renderKrExtra` (bajo el título de cada KR). El detalle del objetivo las usa para "Ver en lectura fácil / lenguaje claro" (solo check-ins con nota: sin nota el back responde `AI_NOTHING_TO_ADAPT`) y "Resumir check-ins" (solo KRs con historial).

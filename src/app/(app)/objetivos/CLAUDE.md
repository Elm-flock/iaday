# Módulo objetivos

Objetivos y resultados clave (`/objetivos`, `/objetivos/nuevo`, `/objetivos/[id]`). Los OKRs son públicos para cualquier usuario autenticado (publicados y cerrados); los borradores solo los ven quienes pueden editarlos (el back responde 404 para un borrador ajeno).

## Archivos

| Archivo                                                         | Rol                                                                                                                                                                                                                              |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page.tsx`                                                      | Lista agrupada por responsable. Filtros en la URL (`cycleId`, `teamId`, `ownerUserId`, `status`); sin `cycleId` = trimestre activo. Pide el ciclo completo y filtra en memoria: el cupo "N de 5" se calcula sobre todo el ciclo. |
| `nuevo/page.tsx`                                                | Alta. Ciclos no cerrados, responsables según rol (`ownerChoices`) con la regla explicada, padre entre objetivos PUBLISHED (puede cruzar ciclos).                                                                                 |
| `[id]/page.tsx`                                                 | Detalle: resumen, alineación (padre/hijos), KRs. Todo en un `Promise.all`; `notFound()` si no existe o no es visible.                                                                                                            |
| `actions.ts`                                                    | `createObjectiveAction` (redirige al detalle), `updateObjectiveAction`, `deleteObjectiveAction` (redirige a la lista), `publishObjectiveAction`, `create/update/deleteKeyResultAction`. Invalidan `okrs` y `objective:{id}`.     |
| `messages.ts`                                                   | Copy es-AR por código de dominio del back (`OKR_CODE_COPY` cubre los 15 de `okrs.errors.ts`), copy por status (403/404) y etiquetas. Constantes de límites (3–5).                                                                |
| `objective-form-data.ts`                                        | Parseo/validación puro del FormData. Decimales es-AR (`1.234,5`) → string para la API.                                                                                                                                           |
| `policy.ts`                                                     | Espejo de las políticas del back para habilitar/deshabilitar (`canEditObjective`, `canChangeKrTarget`, `ownerChoices`, `countsByOwner`, `limitStatus`). La autorización real es de Nest.                                         |
| `_components/objectives-list-view.tsx`, `objective-meta.tsx`    | Presentacionales (server): tarjetas con tags de tipo/origen, `ObjectiveProgressBadge` (neutro o banda) + `ScoreBar` solo con check-ins, cantidad de KRs; `LimitIndicator`.                                                       |
| `_components/objectives-filters.tsx`                            | Hoja cliente: filtros que navegan con `router.push`.                                                                                                                                                                             |
| `_components/objective-create-form.tsx`, `objective-fields.tsx` | Formulario con `useActionForm`; selects no controlados (conserva lo tipeado ante errores).                                                                                                                                       |
| `_components/objective-actions.tsx`                             | Editar (Modal), eliminar (solo borrador, `ConfirmDialog`), publicar (`ConfirmDialog` que explica la regla ≥3 objetivos / ≥3 KRs; el back valida).                                                                                |
| `_components/key-results-card.tsx`, `kr-form-modal.tsx`         | Tabla de KRs (inicio/meta/actual/unidad/score/banda o "Sin check-ins") con "Registrar check-in" por fila (módulo `check-ins`) y alta/edición/baja.                                                                               |

## Reglas

- DAL: `src/lib/dal/objectives.ts` (`'use cache: private'`, tags `okrs` y `objective:{id}`; la mezcla 50/50 de equipos ya cuelga de `okrs`).
- Límite de 3–5 objetivos por responsable y ciclo, contando borrador + publicado. El conteo "N de 5" solo se afirma si quien mira ve los borradores de ese responsable (él mismo, líder del equipo, ADMIN); para el resto se muestra "N objetivos publicados".
- Publicar NO se deshabilita de antemano: se explica la regla y el back responde `MIN_OBJECTIVES_NOT_MET` / `MIN_KRS_NOT_MET` con copy claro.
- Tras publicar: tipo y origen del objetivo y inicio/meta de los KRs quedan deshabilitados con la razón visible; solo ADMIN/líder cambian inicio y meta (para un objetivo individual ajeno, el front ofrece el campo a cualquier LÍDER y el back confirma con 403 + copy). Los KRs de un objetivo publicado no se pueden quitar.
- Los líderes no crean objetivos individuales de sus integrantes (cada persona crea el suyo); ADMIN crea para cualquiera.
- Un KR nuevo siempre pide inicio y meta (numérico) aunque el objetivo esté publicado; el bloqueo es solo al editar.
- Formularios con `useActionForm`, no `<form action>`.

## Tests

`objetivos-logic.test.ts` (copy de todos los códigos, parseo, políticas), `actions.test.ts` (fetch mockeado: errores, redirect, `updateTag`), `_components/objetivos-views.test.tsx` (límite, lista, KRs, campos bloqueados), DAL en `src/lib/dal/objectives.test.ts`; e2e contra el back real en `e2e/objetivos.spec.ts`.

## Cierre y responsive (F5)

- Objetivo CLOSED: `FinalResult` (objective-meta) muestra "Puntaje final 0,80" + Logrado / No logrado (ícono + palabra) en lista y detalle.
- Tabla de KRs: tabla completa desde `xl`; debajo, cada fila se apila (`data-label` por celda, roles ARIA explícitos) sin scroll horizontal. Los IconButton de la tabla usan `tooltipAlign="end"`.

## Ayuda de IA (ver `_ai/CLAUDE.md`)

- Detalle (`[id]/page.tsx`): pide `getAiStatus()` en el mismo `Promise.all`. Con IA activa, `ObjectiveDetailView` recibe la ranura `accessibleVersion` ("Ver en lectura fácil / lenguaje claro" del objetivo), `KeyResultsCard` recibe `suggestContext` y el historial recibe las ranuras de check-ins. Con IA apagada nada de esto se renderiza.
- Alta (`nuevo/page.tsx` -> `ObjectiveCreateForm aiEnabled`): "Sugerir redacción" lee ciclo, responsable, título, descripción y tipo; "Usar sugerencia" remonta `ObjectiveFields` con `key` para precargar título/descripción sin perder el resto. NUNCA envía el formulario.
- Modal de KR: "Sugerir redacción" usa el objetivo como contexto y precarga título, unidad, inicio y meta (es-AR); con inicio/meta bloqueados no los pisa.

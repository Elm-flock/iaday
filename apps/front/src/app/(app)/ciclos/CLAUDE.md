# Módulo ciclos

Ciclos anuales y trimestrales (`/ciclos`, `/ciclos/[id]`). Lectura para cualquier usuario; alta, edición, activación y cierre solo ADMIN (el back lo exige; el front deshabilita con explicación visible).

## Archivos

| Archivo                                                       | Rol                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page.tsx`, `[id]/page.tsx`                                   | Contenedores server dentro de `<Suspense>` (params/sesión son runtime). `Promise.all` de sesión + ciclos. 404 con `notFound()`.                                                                               |
| `actions.ts`                                                  | `createCycleAction`, `updateCycleAction`, `activateCycleAction`, `closeCycleAction` (solo exporta funciones async). Invalidan con `updateTag('cycles')` y `cycle:{id}` (+ `okrs` al cerrar).                  |
| `messages.ts`                                                 | Copy es-AR por código de dominio del back (`INVALID_DATE_RANGE`, `QUARTER_OUT_OF_PARENT_RANGE`, `QUARTER_OVERLAPS_SIBLING`, `INVALID_THRESHOLD`, `INVALID_CYCLE_TRANSITION`, `CYCLE_NAME_TAKEN`) y etiquetas. |
| `cycle-form-data.ts`                                          | Parseo/validación puro del FormData (umbrales `0,70` o `0.7` → número en (0, 1]).                                                                                                                             |
| `cycle-tree.ts`                                               | Agrupa trimestres bajo su anual.                                                                                                                                                                              |
| `_components/*-view.tsx`, `cycle-status-badge.tsx`            | Presentacionales (server). Estado = ícono + palabra.                                                                                                                                                          |
| `_components/cycle-form-modal.tsx`, `cycle-admin-actions.tsx` | Hojas `'use client'`: formulario en `Modal`, activar/cerrar con `ConfirmDialog` ("Cerrar ciclo" es irreversible).                                                                                             |

## Reglas

- DAL: `src/lib/dal/cycles.ts` (`'use cache: private'`, tags `cycles`, `cycle:{id}`). Umbrales y fechas vienen como number / `YYYY-MM-DD`; se muestran con `formatScore` (`1,00`) y `formatDate`.
- Nombre de ciclo único en toda la organización (el back compara sin espacios, mayúsculas ni tildes; incluye ciclos cerrados): el 409 `CYCLE_NAME_TAKEN` se vuelve error del campo Nombre en alta y edición (`cycleFailureState` en `actions.ts`, copy `cycleNameTakenCopy`). Los e2e que crean ciclos usan nombres con sufijo único.
- Fechas solo editables en DRAFT; umbrales hasta el cierre; CLOSED no ofrece acciones.
- Un solo CTA primario por vista (sin botón duplicado en el estado vacío).
- Formularios con `useActionForm` (`src/lib/actions/use-action-form.ts`), no `<form action>`: React 19 resetea el form tras la action y los `<select>` volvían a su opción inicial.

## Tests

`cycle-form-data.test.ts`, `cycle-tree.test.ts`, `actions.test.ts` (fetch mockeado: mapeo de errores, `updateTag`), `_components/ciclos-views.test.tsx`; e2e en `e2e/ciclos-equipos.spec.ts`.

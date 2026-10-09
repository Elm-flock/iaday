# Módulo equipos

Árbol de equipos (`/equipos`) y detalle (`/equipos/[id]?cycleId=`): integrantes, líder e indicador 50/50 (top-down vs bottom-up) del ciclo elegido. Lectura para todos; crear/editar equipos e integrantes solo ADMIN.

## Archivos

| Archivo                                                                         | Rol                                                                                                                                                                         |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page.tsx`, `[id]/page.tsx`                                                     | Contenedores server en `<Suspense>`. Detalle: lo independiente en paralelo; sin `?cycleId=` el ciclo por defecto (trimestre activo) sale de la lista de ciclos.             |
| `actions.ts`                                                                    | `createTeamAction`, `updateTeamAction`, `addMemberAction`, `setLeadAction`, `removeMemberAction`. `updateTag('teams')`, `team:{id}` y `me` (la sesión incluye los equipos). |
| `messages.ts`                                                                   | Copy es-AR de errores (409 = nombre repetido o movimiento que crea ciclo).                                                                                                  |
| `team-tree.ts`                                                                  | `flattenTeams`, `selfAndDescendantIds` (candidatos a padre), `originMixShares`.                                                                                             |
| `_components/origin-mix-indicator.tsx`                                          | Muestra lo que informa la API (`originMix`); fuera de 40–60 % es aviso suave (ícono + palabra), nunca bloquea.                                                              |
| `_components/members-manager.tsx`, `team-admin-actions.tsx`, `cycle-select.tsx` | Hojas `'use client'` (modales, confirmación de quitar, selector de ciclo que navega con `?cycleId=`).                                                                       |

## Reglas

- DAL: `src/lib/dal/teams.ts` (tags `teams`, `team:{id}`; con ciclo también `cycle:{id}` y `okrs`) y `users.ts` para candidatos.
- El equipo raíz (organización) no tiene selector de padre.
- Sin permiso: botones deshabilitados con la razón visible (`DisabledAction`).

## Tests

`team-tree.test.ts`, `_components/equipos-views.test.tsx`, DAL en `src/lib/dal/dal-modules.test.ts`; e2e en `e2e/ciclos-equipos.spec.ts`.

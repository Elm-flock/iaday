# Módulo admin/pedidos-adaptacion

`/admin/pedidos-adaptacion`: bandeja de administración de los pedidos de documento adaptado (ver `../../pedidos-adaptacion/CLAUDE.md`). SOLO ADMIN: el resto recibe `notFound()` y en el menú ve "Pedidos de adaptación" deshabilitado con su explicación; el back exige ADMIN en listar, asignar, entregar y rechazar.

## Archivos

| Archivo                               | Rol                                                                                                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page.tsx`                            | `?estado=PENDIENTE\|EN_CURSO\|ENTREGADA\|RECHAZADA`, `?vencidos=1`, `?pagina=`; `GET /adaptation-requests` + usuarios (ADMIN activos para asignar) en paralelo. |
| `actions.ts`                          | `assignRequestAction`, `deliverRequestAction`, `rejectRequestAction` (validan en `request-form-data.ts` y luego llaman al back; `refresh()`).                   |
| `_components/requests-filter.tsx`     | Filtros como enlaces con `aria-current` (sin JS).                                                                                                               |
| `_components/requests-table.tsx`      | Presentacional. Vencidos: fondo de advertencia + `RequestOverdueBadge` (ícono + palabra) + `data-overdue`. Resueltos: sin acciones.                             |
| `_components/request-row-actions.tsx` | Hoja cliente: Asignar / Entregar / Rechazar, cada una en su `Modal`.                                                                                            |

## Reglas

- Plazo: 10 días corridos (`ADAPTATION_DUE_DAYS` en el back). Vencido = abierto y pasado de fecha; lo calcula el back (`overdue`).
- Rechazar exige justificación en lenguaje claro (mín. 20); entregar exige nota (mín. 10) y enlace http(s) opcional. Ni el texto ni el enlace se loguean ni se auditan.

## Tests

`../../pedidos-adaptacion/requests-views.test.tsx` y `actions.test.ts`; e2e en `e2e/journeys/07-pedidos-adaptacion.spec.ts` (el vencido se fabrica con `docker exec ... psql` sobre la base e2e: la API no admite fechas límite pasadas).

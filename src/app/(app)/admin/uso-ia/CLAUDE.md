# Módulo admin/uso-ia

`/admin/uso-ia`: uso, costo estimado e impacto de la ayuda de IA (RD 707/2026, art. 14.5). SOLO ADMIN: el resto recibe `notFound()` y en el menú ve "Uso de IA" deshabilitado con su explicación ("Solo administración puede ver el uso de IA."); el back exige ADMIN en `GET /ai/usage` y `GET /ai/impact`. Datos AGREGADOS: nunca por persona ni rankings (el back solo informa un conteo de personas activas).

## Archivos

| Archivo                        | Rol                                                                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page.tsx`                     | Contenedor server en `<Suspense>`: sesión + `?dias=` (7/30/90, default 30) y luego uso + impacto en paralelo; `notFound()` si no es ADMIN.                                    |
| `messages.ts`                  | Etiquetas es-AR (funciones, pasos, códigos de error), `COST_NOTE` y formatos (`formatCostUsd` "US$ 0,0018", `formatMs`, `formatRatio`; sin percentil = "Sin datos", nunca 0). |
| `_components/impact-tiles.tsx` | Adopción, tiempo (medianas), calidad (delta de legibilidad Szigriszt-Pazos, tasa de revisión humana) y costo estimado.                                                        |
| `_components/usage-table.tsx`  | `UsageTable` (por función o por modelo: llamadas, fallidas, tokens, costo estimado, p50/p95, % con modelo de respaldo) y `FailuresTable` (por paso y motivo).                 |
| `_components/range-filter.tsx` | Enlaces de período con `aria-current`; sin JS.                                                                                                                                |

## Reglas

- DAL: `src/lib/dal/ai.ts` (`getAiUsage(days)`, `getAiImpact(days)`), sin cache de Next. `from` = ahora - N días, calculado DESPUÉS de `await connection()` (regla de prerender de Next 16.4).
- El costo SIEMPRE se rotula como estimación (columna "Costo estimado", título "Costo (estimado)" y la nota de la tabla): el free tier del proveedor no factura.
- Estado vacío explicado en cada tabla; tablas con `caption` accesible y `scope` en encabezados; scroll horizontal solo dentro de la card.

## Tests

`uso-ia-views.test.tsx` (formatos es-AR, estimación rotulada, "Sin datos", vacíos, filtro de período); nav en `_components/app-nav.test.tsx`; e2e en `e2e/journeys/adaptacion-ia.spec.ts` (ADMIN ve las tablas, miembro 404, sin nombres de personas, axe claro/oscuro) y `e2e/a11y.spec.ts` (ruta `/admin/uso-ia`).

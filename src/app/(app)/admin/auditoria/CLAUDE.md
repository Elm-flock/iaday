# Módulo admin/auditoria

`/admin/auditoria`: registro de auditoría de solo lectura (quién, qué, cuándo y qué cambió). SOLO ADMIN: el resto recibe `notFound()` y en el menú ve "Auditoría" deshabilitado con su explicación ("Solo administración puede ver la auditoría."); el back exige ADMIN en `GET /audit`. Nunca muestra contenido de feedback ni texto libre.

## Archivos

| Archivo                            | Rol                                                                                                                                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page.tsx`                         | Contenedor server en `<Suspense>`: sesión + `?accion=&entidad=&persona=&desde=&hasta=&pagina=` (todo validado: acción conocida, UUID, día real) y luego `GET /audit` + usuarios en paralelo; `notFound()` si no es ADMIN.                     |
| `audit-diff.ts`                    | PURO. `ACTION_LABEL: Record<AuditAction, string>` (agregar una acción al back rompe el typecheck hasta rotularla), `ENTITY_LABEL`, `FIELD_LABEL` (LISTA PERMITIDA), `describeChanges`, `actorLabel`, fechas del filtro (día argentino UTC-3). |
| `_components/audit-filters.tsx`    | Formulario GET (sin JS) con acción, elemento, persona, desde y hasta; "Quitar filtros" solo si hay filtros.                                                                                                                                   |
| `_components/audit-table.tsx`      | Presentacional: fecha (es-AR, Buenos Aires), quién ("Usuario eliminado" si `actorId` es nulo), acción en español, elemento + código corto y el diff antes → después.                                                                          |
| `_components/audit-pagination.tsx` | Anterior / siguiente como enlaces que conservan los filtros; 20 por página (`AUDIT_PAGE_SIZE`).                                                                                                                                               |

## Reglas

- DAL: `src/lib/dal/audit.ts` (`listAudit`), sin cache de Next, `await connection()`.
- PRIVACIDAD: el diff solo muestra claves de `FIELD_LABEL`; ids técnicos, trazas, versiones de prompt y cualquier clave desconocida (p. ej. `content`) se ocultan. Un registro cuyo `entityType` mencione feedback no muestra detalle. Los pedidos de adaptación se auditan sin texto libre (lo garantiza el back).
- Estado de un cambio = palabras (Borrador → Publicado), nunca solo color. Valores es-AR (`0,70`).
- Al sumar una acción al back: rotularla en `ACTION_LABEL` (y, si trae campos nuevos, en `FIELD_LABEL`) y actualizar `docs/manuales`.

## Tests

`audit-diff.test.ts` (etiquetas de las 18 acciones, diff, privacidad, fechas), `audit-views.test.tsx` (tabla, vacío, paginación, filtros), nav en `_components/app-nav.test.tsx`; e2e en `e2e/journeys/07-pedidos-adaptacion.spec.ts` (ADMIN ve acciones/nombres/cambios, filtra, sin texto libre; no-ADMIN 404) y `e2e/a11y.spec.ts` (ruta `/admin/auditoria`).

## Acciones del asistente y cambio de contraseña

- `ACTION_LABEL` (`Record<AuditAction, string>`, exhaustivo) rotula `USER_PASSWORD_CHANGED` ("Cambio de contraseña"), `ASSISTANT_PLAN_CONFIRMED` / `_DISCARDED` ("Plan del asistente confirmado/descartado") y `ASSISTANT_ACTION_EXECUTED` / `_FAILED` ("Acción del asistente ejecutada/fallida").
- Marca **"Vía asistente"** (ícono + palabra) en la celda de acción cuando `after.via === 'assistant'` (`isViaAssistant`). Del `after` solo se muestran `actionType` (con `ASSISTANT_ACTION_LABEL`) y `errorCode`; `planId`/`step` no (lista permitida).
- Entidad `AssistantPlan` = "Plan del asistente". El asistente enlaza acá desde sus consultas de auditoría con los mismos filtros.

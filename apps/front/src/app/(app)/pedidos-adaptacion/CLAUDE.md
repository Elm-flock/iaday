# Módulo pedidos-adaptacion (art. 14.5 RD 707/2026)

Pedir un documento adaptado a una PERSONA (lectura fácil, lenguaje claro, audio, apoyo visual, reunión adaptada u otro), no solo a la IA. Funciona aunque `AI_ENABLED=false`. Dos caras:

- **Personas** (`/pedidos-adaptacion`, menú "Documentos adaptados"): "Mis pedidos" con estado (ícono + palabra), fecha límite y, ya resuelto, la nota de entrega (con enlace) o "Por qué no pudimos hacerlo" (justificación). `/pedidos-adaptacion/nuevo` es el formulario; `?tipo=objective|check-in|feedback&id=<uuid>` precarga el vínculo. Entradas: menú, enlace "¿Necesitás otro formato? Pedilo a una persona" del panel de IA (`_ai/_components/accessible-version-panel.tsx`) y el manual.
- **Administración** (`/admin/pedidos-adaptacion`, ver su CLAUDE.md).

## Archivos

| Archivo                      | Rol                                                                                                                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page.tsx`, `nuevo/page.tsx` | Contenedores en `<Suspense>`; el listado pide `GET /adaptation-requests/mine`. El enlace del panel de IA se valida (tipo permitido + UUID) antes de armar el vínculo.                  |
| `messages.ts`                | Etiquetas es-AR (formatos, estados, tono), mínimos que espejan el dominio del back (nota 10, justificación 20), copy de errores por código (`ADMIN_ERROR_COPY`, `REQUEST_ERROR_COPY`). |
| `request-form-data.ts`       | Validación pura de crear, asignar, entregar y rechazar (rechazar sin justificación NO llega al back: error de campo).                                                                  |
| `actions.ts`                 | `createAdaptationRequestAction` (redirect a `?creado=1`). Las de administración viven en `admin/pedidos-adaptacion/actions.ts`.                                                        |
| `_components/*`              | `RequestForm` (cliente), `MyRequestCard`, `RequestStatusBadge` / `RequestOverdueBadge` (compartidos con administración).                                                               |

## Reglas

- DAL: `src/lib/dal/adaptation-requests.ts`, SIN cache de Next (texto libre de la persona). Mutaciones con `refresh()`, nunca `updateTag`.
- Un feedback solo se vincula si la persona lo envió o recibió (el back responde 404 al resto, también a ADMIN). Administración recibe `entityId: null` de un feedback vinculado: se muestra "privado: administración no lo puede leer". El formulario avisa que administración no puede leerlo.
- Pedidos ajenos: el back responde 404 (no 403) y no hay pantalla de detalle de otras personas.
- Rechazo: justificación obligatoria (front + back 422 `ADAPTATION_REJECTION_JUSTIFICATION_REQUIRED`); la lee quien pidió.

## Tests

`request-form-data.test.ts`, `actions.test.ts` (Bearer, rutas, vínculo, 404, 422, 409), `requests-views.test.tsx`; e2e `e2e/journeys/07-pedidos-adaptacion.spec.ts` (pedir, desde el panel de IA, vínculo a feedback, 404 de ajenos, vencido con ícono + palabra, rechazo sin justificación, asignar/entregar, auditoría, axe claro/oscuro).

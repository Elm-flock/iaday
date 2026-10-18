# Módulo feedback

Feedback **privado** entre dos personas (`/feedback`, `/feedback/nuevo`, `/feedback/[id]`). Lo ven solo quien lo escribe y quien lo recibe: ni ADMIN, ni líder, ni terceros (el back responde 404 para lo ajeno, indistinguible de lo inexistente).

## Archivos

| Archivo                                                                     | Rol                                                                                                                                                                                                      |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page.tsx`                                                                  | Bandeja con pestañas Recibido / Enviado (`?box=`), contador de sin leer y avisos de éxito (`?enviado=1`, `?eliminado=1`). Un solo botón primario: "Dar feedback".                                        |
| `nuevo/page.tsx`                                                            | Formulario: destinatario (personas activas **sin quien escribe**), mensaje y enlace opcional a un objetivo/KR visible. `?para=` preselecciona.                                                           |
| `[id]/page.tsx`                                                             | Detalle. `notFound()` si el back responde 404 o si quien mira no es emisor/receptor. Título de metadatos genérico (nunca el contenido). El receptor dispara `MarkAsRead`; el autor ve Editar / Eliminar. |
| `actions.ts`                                                                | `createFeedbackAction` (redirige a Enviados), `updateFeedbackAction` (`refresh()`), `deleteFeedbackAction` (redirige), `markFeedbackReadAction`. **Sin `updateTag`**: no hay cache que invalidar.        |
| `messages.ts`                                                               | Aviso de privacidad (`PRIVACY_NOTICE`), guía de feedback constructivo, copy de vacíos y de errores por status (400 incluye el autoenvío, 403 solo el autor, 404).                                        |
| `policy.ts`                                                                 | `isUnread`, `feedbackRole`, `canModifyFeedback` (espejo del back) y `excerpt`.                                                                                                                           |
| `feedback-form-data.ts`                                                     | Parseo puro: destinatario y mensaje (1..2000) obligatorios; `link` (`obj:` / `kr:`, ver `lib/okr-link.ts`) opcional.                                                                                     |
| `_components/mark-as-read.tsx`                                              | Hoja cliente sin UI: efecto que llama a la Server Action y hace `router.refresh()` (nunca durante el render). El back es idempotente.                                                                    |
| `_components/feedback-author-actions.tsx`                                   | Hoja cliente: Editar (Modal con `useActionForm`) y Eliminar (`ConfirmDialog` "Eliminar feedback").                                                                                                       |
| `_components/feedback-form.tsx`                                             | Hoja cliente del alta (selects no controlados: conserva lo tipeado ante un error).                                                                                                                       |
| `_components/*-view.tsx`, `unread-badge`, `feedback-tabs`, `privacy-notice` | Presentacionales. "Sin leer" = ícono + palabra (`StatusBadge` info); "Leído" gris.                                                                                                                       |

## Reglas de privacidad (NO romper)

- **DAL sin cache**: `src/lib/dal/feedback.ts` no usa `'use cache'`, `'use cache: private'` ni `unstable_cache`, y no etiqueta nada. Son lecturas dinámicas por request dentro de `<Suspense>`. Un test (`src/lib/dal/cfr.test.ts`) falla si aparece una directiva de cache o un `console.*` en ese archivo.
- Cada función del DAL llama `await connection()` antes del fetch: sin eso, Next (dev, `cacheComponents`) marca el fetch no cacheado como "unstable value Math.random() while prerendering".
- Nunca se loguea contenido de feedback (ni en actions ni en el DAL). El `title` de la página es fijo.
- El feedback no se renderiza en ningún lugar fuera de la vista del emisor y del receptor (no hay dashboard, reportes ni PDF con feedback).
- Las mutaciones usan `refresh()` (router del cliente), no `updateTag`.
- El back informa `readAt` y `editedAt` (ya no hay `updatedAt`): marcar como leído no toca `editedAt`, por eso la UI muestra "Editado" (ícono + palabra, con `dd/mm/aaaa hh:mm` en el detalle) solo cuando `editedAt` no es null.
- Con `cacheComponents`, Next conserva las páginas anteriores ocultas (`Activity`): en e2e filtrar con `{ visible: true }` al contar textos.

## Tests

`feedback-logic.test.ts` (políticas, parseo, copy incl. autoenvío), `actions.test.ts` (fetch mockeado: sin `updateTag`, redirects, 403/404), `_components/feedback-views.test.tsx` (aviso de privacidad, badge "Sin leer", formulario, confirmación "Eliminar feedback", `MarkAsRead`), `src/lib/dal/cfr.test.ts` (sin cache); e2e contra el back real en `e2e/cfr.spec.ts` (A envía → B lo ve "Sin leer" y lo abre; C y ADMIN no lo ven ni por URL directa; A edita y elimina).

## Ayuda de IA (ver `_ai/CLAUDE.md`)

- El detalle (`[id]/page.tsx`) renderiza `<AccessibleVersion entityType="feedback" owner={null}/>` dentro de su propio `<Suspense>` y se lo pasa a `FeedbackDetailView` por la ranura `accessibleVersion`. Solo se llega acá siendo emisor o receptor (lo ajeno es 404, también para ADMIN y también para `/ai/adapt/feedback/:id`).
- PRIVACIDAD: la versión accesible es tan privada como el feedback: sin cache de Next, vive en el estado del cliente, nunca se loguea. "Validar" va deshabilitado con la razón (no hay validador externo posible); solo "Me sirve" para quien la pidió.

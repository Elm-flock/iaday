# Módulo reconocimientos

Muro **público** de reconocimientos (`/reconocimientos`, `/reconocimientos/nuevo`). Cualquier persona autenticada lo ve y puede reconocer. No hay conteos por persona, ranking ni "top": ni en la UI ni en el DAL.

## Archivos

| Archivo                             | Rol                                                                                                                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page.tsx`                          | Muro paginado (10 por página, más nuevo primero), filtro por persona (`?persona=`, `?page=`) con un `<form method="get">` (sin JS). Resuelve el hito de cada tarjeta con `getObjective` (cacheado) en paralelo. |
| `nuevo/page.tsx`                    | Flujo en dos pasos **sin estado en el cliente**: 1) elegir persona (GET `?para=`, sin quien escribe); 2) elegir un logro suyo + mensaje.                                                                        |
| `milestones.ts`                     | Helper puro, espejo de `isMilestone` del back: KR con score >= 0,70 (inclusivo) u objetivo CLOSED. `listMilestones` filtra objetivos propios de la persona, sin borradores.                                     |
| `actions.ts`                        | `createRecognitionAction`: valida, `POST /recognitions`, `updateTag('recognitions')` y vuelve al muro (`?creado=1`).                                                                                            |
| `messages.ts`                       | Copy de `MILESTONE_NOT_REACHED` (explica la regla y cómo seguir), 400 (incluye autorreconocimiento) y 404; `MILESTONE_RULE`.                                                                                    |
| `recognition-form-data.ts`          | Parseo puro: persona, logro (`obj:` / `kr:`, ver `lib/okr-link.ts`) y mensaje (1..2000) obligatorios.                                                                                                           |
| `_components/recognition-card.tsx`  | Presentacional: quién → a quién, mensaje, hito (objetivo/KR + `BandBadge` y puntaje, o "Cerrado") y fecha `dd/mm/aaaa`.                                                                                         |
| `_components/recognitions-wall.tsx` | Presentacional: filtro, tarjetas, vacío y paginación (Anterior/Siguiente conservan el filtro).                                                                                                                  |
| `_components/recognition-form.tsx`  | Hoja cliente: select de logros (con puntaje) + mensaje, `useActionForm`.                                                                                                                                        |

## Reglas

- DAL: `src/lib/dal/recognitions.ts` (`'use cache: private'`, tag `recognitions`). El muro es público, pero se mantiene `private` para no compartir cache entre usuarios (los filtros son datos, nunca el token).
- La UI **exige** un logro (el back permite reconocimiento sin enlace; el front no lo ofrece: "Reconocer un logro"). La regla del hito vive en el back; el helper solo evita ofrecer opciones inválidas. Si el estado cambió, el back responde 422 `MILESTONE_NOT_REACHED` y se muestra el copy.
- El puntaje que muestra la tarjeta es el **actual** del KR/objetivo, no el del momento del reconocimiento.
- Solo se ofrecen objetivos cuyo responsable es la persona (individuales); KRs ejecutados por ella dentro de objetivos de equipo no se listan.
- Sin emojis ni signos de exclamación en el copy, tampoco el de reconocimiento.

## Tests

`reconocimientos-logic.test.ts` (helper de hitos: 0,69 vs 0,70, CLOSED, borradores/otros dueños; parseo; copy `MILESTONE_NOT_REACHED` y autorreconocimiento), `actions.test.ts`, `_components/reconocimientos-views.test.tsx` (tarjeta, muro sin rankings, paginado, formulario y error del back), `src/lib/dal/cfr.test.ts`; e2e en `e2e/cfr.spec.ts` (D reconoce a A por un KR de 0,80; el de 0,69 no se ofrece y el back lo rechaza si se fuerza).

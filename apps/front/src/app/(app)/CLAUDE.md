# Inicio (dashboard) y shell autenticado

`/` responde "¿cómo vengo?" en 5 segundos para la persona logueada, en el ciclo activo (trimestre vigente hoy; si no, primer trimestre activo; si no, anual activo). Selector de ciclo opcional con `?cycleId=` (`equipos/_components/cycle-select.tsx` con `allowNone={false}`).

## Archivos

| Archivo                                                 | Rol                                                                                                                                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page.tsx`                                              | Cabecera estática + `<DashboardSections>`. Sin datos a nivel página.                                                                                                                                                      |
| `_components/dashboard/sections.tsx`                    | Server Components async, cada grupo en su `<Suspense>`: `FeedbackSection`, `CycleScope` (selector + Mis objetivos + Mis equipos si lidera + Gestión si ADMIN), `PendingSection`, `RecognitionsSection`. Sin cascadas.     |
| `_components/dashboard/*-card.tsx`, `feedback-note.tsx` | Presentacionales (testeables con RTL): `MyObjectivesCard`, `PendingCard`, `RecognitionsCard`, `LeaderTeamsCard`, `AdminCard`, `FeedbackNote`.                                                                             |
| `_components/dashboard/primary-action.ts`               | `dashboardPrimary`: regla de la ÚNICA acción primaria.                                                                                                                                                                    |
| `src/lib/dal/dashboard.ts`                              | Composición sobre los DAL existentes (`getMyObjectives`, `getPendingSummary`, `getRecognitionsSummary`, `getLedTeams`). `src/lib/active-cycle.ts`: `pickDashboardCycle`. `countUnreadFeedback` vive en `dal/feedback.ts`. |

## Reglas

- **Una sola acción primaria**: (1) con check-ins vencidos, "Registrar check-in" (`/check-ins`) en la card de pendientes; (2) si no, y no hay objetivos propios en el ciclo, "Crear objetivo" (empty state de Mis objetivos); (3) si no, ninguna (el resto son enlaces/botones secundarios). Se eligió esto porque lo vencido es lo más urgente y de menor esfuerzo, y sin objetivos no hay nada que seguir. `MyObjectivesCard` recibe `primaryCreate` calculado con los mismos datos cacheados (sin pedido extra).
- **Mis objetivos**: individuales (`ownerUserId == yo`) y, en un grupo aparte por equipo, los de equipos a los que pertenezco. Estados con `ObjectiveProgressBadge` (neutro "Sin check-ins" / "Check-in vencido" / banda) + `ScoreBar` solo con datos; "N de M KRs con check-in"; borradores muestran "Borrador" sin puntaje.
- **Pendientes**: `GET /check-ins/pending` (solo vencidos): total + 5 primeros. Vacío: "Estás al día con tus check-ins."
- **Reconocimientos**: 3 recibidos (`toUserId`) + 3 del muro, con nombres. Sin conteos por persona ni rankings.
- **Feedback**: PRIVACIDAD. Solo "Tenés N feedback sin leer." (conteo de MI bandeja `received`, sin cache, `await connection()` en el DAL) con enlace a `/feedback`. Nunca contenido, remitente ni fecha; con 0 no se muestra nada.
- **Líder** (`user.teams` con `isLead`): "Mis equipos" con el 50/50 del ciclo (`originMix` de `GET /teams/:id?cycleId`, aviso suave fuera de 40–60 %) y enlace al equipo (ahí está el PDF). **ADMIN**: card "Gestión" (el título evita la palabra "Administración", que ya usa el menú de usuario y e2e) con ciclo activo y accesos a Ciclos/Equipos/Usuarios.
- **Tokens/cache**: todo vía DAL (`'use cache: private'` salvo feedback). `new Date()` (hoy en Buenos Aires) va DESPUÉS de `await connection()` (regla de prerender de Next 16.4).
- **Contador en el nav**: `AppNavWithRole` (dentro del `<Suspense>` del layout) pide sesión + pendientes en paralelo; `SidebarItem` acepta `count` (texto accesible "N pendientes", no solo color). Si falla el pedido de pendientes el nav se muestra sin contador; la sesión sí propaga su error (401 -> login). El shell sigue estático y el fallback no usa hooks de runtime.
- Con cacheComponents las páginas anteriores quedan ocultas en el DOM (Activity): en Playwright contar con `filter({ visible: true })`.

## Tests

`_components/dashboard/dashboard-views.test.tsx` (cada card: neutro/vencido/banda, vacíos, líder/admin, sin contenido de feedback, regla de primaria), `src/lib/dal/dashboard.test.ts` (composición con fetch mockeado), `src/lib/active-cycle.test.ts`, `page.test.tsx`, `_components/app-nav.test.tsx` (contador). E2E contra el back real: `e2e/inicio.spec.ts` (miembro con KR vencido + check-in que actualiza pendientes, líder 50/50, admin, miembro vacío; screenshots `e2e/__screenshots__/inicio-miembro.png` y `inicio-lider.png`).

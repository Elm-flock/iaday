# Módulo auth

Login, logout y sesión por cookies. El browser NUNCA llama a Nest: Next es el BFF y guarda los tokens en cookies httpOnly.

## Rutas y archivos

| Archivo                                                   | Rol                                                                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `login/page.tsx`                                          | Superficie de marca (`bg-noche`) + Card. `next` se lee de `searchParams` dentro de `<Suspense>`.                       |
| `login/_components/login-form.tsx`                        | `'use client'`, `useActionState(loginAction)`. Error en `Alert`; conserva el email.                                    |
| `actions.ts`                                              | `loginAction` y `logoutAction` (Server Actions). Únicos lugares, junto a `src/proxy.ts`, que escriben cookies.         |
| `messages.ts`                                             | Copys de error (un archivo `'use server'` solo exporta funciones async), incl. `CHANGE_PASSWORD_COPY`.                 |
| `cambiar-contrasena/page.tsx`                             | `/cambiar-contrasena`: obligatoria con `mustChangePassword` (solo cambiar o cerrar sesión) y voluntaria desde el menú. |
| `cambiar-contrasena/_components/change-password-form.tsx` | `'use client'`, `useActionForm(changePasswordAction)`: actual + nueva (12+) + repetir.                                 |
| `password-form-data.ts`                                   | Validación previa al back (12–200, distinta de la actual, confirmación).                                               |
| `../../proxy.ts`                                          | Chequeo optimista + refresh silencioso + redirect a `/login?next=`.                                                    |
| `../../lib/auth/{constants,redirect,token}.ts`            | Nombres/opciones de cookies, `safeNext` (anti open redirect), lectura de `exp` sin verificar.                          |
| `../../lib/api/{client,create-client,errors}.ts`          | Cliente openapi-fetch. `authedApi()` agrega Bearer desde `okr_at`; 401 → `redirect('/login')`.                         |
| `../../lib/dal/session.ts`                                | `getCurrentUser()` con `'use cache: private'` + `cacheTag('me')` → `GET /auth/me`.                                     |

## Reglas

- Cookies `okr_at` (access, maxAge = vencimiento informado por el back) y `okr_rt` (refresh): `httpOnly`, `SameSite=Lax`, `Secure` en producción, path `/`. `okr_rr` es una marca efímera (10 s) de reintento del proxy.
- No se pueden setear cookies durante el render de un Server Component: solo en Server Actions, Route Handlers y el proxy.
- Un token NUNCA entra como argumento de una función `'use cache'` (los argumentos se guardan en texto plano). `'use cache: private'` lee `cookies()` directamente.
- Mismo mensaje para cualquier 401 del login (sin enumeración de usuarios); 429 tiene copy propio.
- `next` se valida con `safeNext`: solo rutas relativas del mismo origen.
- **Cambio de contraseña obligatorio** (`mustChangePassword`): toda alta o reseteo por administración deja la bandera. Mientras esté, el back responde `403 PASSWORD_CHANGE_REQUIRED` a todo menos `/auth/change-password`, `/auth/me`, refresh y logout. El front lo resuelve en tres capas: (1) `loginAction` redirige a `/cambiar-contrasena` (conserva `?next=`); (2) `authedApi()` convierte ese 403 en `redirect('/cambiar-contrasena')` para cualquier DAL/acción; (3) `UserMenu` redirige si `getCurrentUser().mustChangePassword`. `changePasswordAction` reemplaza las cookies con la sesión nueva (el back revoca las demás), `updateTag('me')` y vuelve a `next`. Los errores 422 `INVALID_CURRENT_PASSWORD` / `PASSWORD_UNCHANGED` / `PASSWORD_TOO_SHORT` tienen copy propio. Las contraseñas nunca vuelven en `FormState.values`.
- La autorización real es de Nest. El proxy es optimista y no cubre Server Actions por sí solo: cada Server Action/Route Handler re-chequea vía el DAL.

## Refresh silencioso (`src/proxy.ts`)

1. Access vigente (más de 60 s) → pasa.
2. Access ausente/por vencer y hay `okr_rt` → `POST /auth/refresh`. OK: setea ambas cookies y reescribe el header `Cookie` del request para que el render vea los tokens nuevos.
3. 401 (refresh inválido, o carrera con un request paralelo: el back responde 401 sin revocar dentro de 10 s de gracia): si el access todavía sirve, pasa; si no, reintenta UNA vez (redirect a la misma URL con `okr_rr`) sin borrar cookies, porque el request ganador pudo haber seteado las nuevas. Segundo fallo → borra cookies y `/login?next=`.
4. Back caído: no se borra la sesión; con access vencido va a `/login`.

## Tests

- Unit: `lib/auth/*.test.ts`, `lib/api/*.test.ts` (incl. 403 `PASSWORD_CHANGE_REQUIRED`), `actions.test.ts` (login forzado y `changePasswordAction`), `password-form-data.test.ts`, `cambiar-contrasena/change-password-form.test.tsx`, `src/proxy.test.ts`.
- E2E del cambio obligatorio: `e2e/journeys/08-cambio-contrasena.spec.ts` (alta sin contraseña por la UI, ingreso, pantalla obligatoria, validaciones, cambio, reseteo). Los specs que crean personas por API usan `onboardUser` (alta con clave inicial + cambio por API) porque toda alta nace con la bandera.
- E2E (`e2e/auth.spec.ts`) contra el back REAL con un admin sembrado por `npm run e2e:stack -- up`. Credenciales y nombre salen de `e2e/helpers/admin.json` (fuente única, la usa también el seed); `E2E_ADMIN_*` y `API_URL` son solo overrides opcionales.

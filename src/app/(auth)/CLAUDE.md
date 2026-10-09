# Módulo auth

Login, logout y sesión por cookies. El browser NUNCA llama a Nest: Next es el BFF y guarda los tokens en cookies httpOnly.

## Rutas y archivos

| Archivo                                          | Rol                                                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `login/page.tsx`                                 | Superficie de marca (`bg-noche`) + Card. `next` se lee de `searchParams` dentro de `<Suspense>`.               |
| `login/_components/login-form.tsx`               | `'use client'`, `useActionState(loginAction)`. Error en `Alert`; conserva el email.                            |
| `actions.ts`                                     | `loginAction` y `logoutAction` (Server Actions). Únicos lugares, junto a `src/proxy.ts`, que escriben cookies. |
| `messages.ts`                                    | Copys de error (un archivo `'use server'` solo exporta funciones async).                                       |
| `../../proxy.ts`                                 | Chequeo optimista + refresh silencioso + redirect a `/login?next=`.                                            |
| `../../lib/auth/{constants,redirect,token}.ts`   | Nombres/opciones de cookies, `safeNext` (anti open redirect), lectura de `exp` sin verificar.                  |
| `../../lib/api/{client,create-client,errors}.ts` | Cliente openapi-fetch. `authedApi()` agrega Bearer desde `okr_at`; 401 → `redirect('/login')`.                 |
| `../../lib/dal/session.ts`                       | `getCurrentUser()` con `'use cache: private'` + `cacheTag('me')` → `GET /auth/me`.                             |

## Reglas

- Cookies `okr_at` (access, maxAge = vencimiento informado por el back) y `okr_rt` (refresh): `httpOnly`, `SameSite=Lax`, `Secure` en producción, path `/`. `okr_rr` es una marca efímera (10 s) de reintento del proxy.
- No se pueden setear cookies durante el render de un Server Component: solo en Server Actions, Route Handlers y el proxy.
- Un token NUNCA entra como argumento de una función `'use cache'` (los argumentos se guardan en texto plano). `'use cache: private'` lee `cookies()` directamente.
- Mismo mensaje para cualquier 401 del login (sin enumeración de usuarios); 429 tiene copy propio.
- `next` se valida con `safeNext`: solo rutas relativas del mismo origen.
- La autorización real es de Nest. El proxy es optimista y no cubre Server Actions por sí solo: cada Server Action/Route Handler re-chequea vía el DAL.

## Refresh silencioso (`src/proxy.ts`)

1. Access vigente (más de 60 s) → pasa.
2. Access ausente/por vencer y hay `okr_rt` → `POST /auth/refresh`. OK: setea ambas cookies y reescribe el header `Cookie` del request para que el render vea los tokens nuevos.
3. 401 (refresh inválido, o carrera con un request paralelo: el back responde 401 sin revocar dentro de 10 s de gracia): si el access todavía sirve, pasa; si no, reintenta UNA vez (redirect a la misma URL con `okr_rr`) sin borrar cookies, porque el request ganador pudo haber seteado las nuevas. Segundo fallo → borra cookies y `/login?next=`.
4. Back caído: no se borra la sesión; con access vencido va a `/login`.

## Tests

- Unit: `lib/auth/*.test.ts`, `lib/api/*.test.ts`, `actions.test.ts`, `src/proxy.test.ts`.
- E2E (`e2e/auth.spec.ts`) contra el back REAL con un admin sembrado: `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` / `E2E_ADMIN_NAME` (defaults `admin@e2e.test`, `E2e-Password-123!`, `Ana Admin`) y `API_URL`.

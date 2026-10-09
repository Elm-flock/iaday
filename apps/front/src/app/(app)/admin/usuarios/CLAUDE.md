# Módulo admin/usuarios

`/admin/usuarios`: alta de usuarios, cambio de nombre/rol/estado y reseteo de contraseña. SOLO ADMIN: el resto recibe `notFound()` (con Cache Components el status HTTP queda en 200 porque el shell ya se envió, pero nunca se renderiza la lista) y en el menú ve "Usuarios" deshabilitado con la explicación. El back exige ADMIN en cada mutación.

## Archivos

| Archivo                       | Rol                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `page.tsx`                    | Contenedor server en `<Suspense>`: sesión + usuarios en paralelo; `notFound()` si no es ADMIN.        |
| `actions.ts`                  | `createUserAction`, `updateUserAction`, `resetPasswordAction`. `updateTag('users' / 'teams' / 'me')`. |
| `user-form-data.ts`           | Validación pura (email, rol, contraseña 8–200). Al editarse a uno mismo no se envían rol ni `active`. |
| `messages.ts`                 | Copy de errores (409 email repetido, 422 autocambio de rol/estado) y etiquetas de rol.                |
| `_components/users-table.tsx` | Presentacional. `_components/user-modals.tsx`: hojas `'use client'` (crear, editar, restablecer).     |

## Reglas

- Las contraseñas nunca se devuelven en `FormState.values`.
- DAL: `src/lib/dal/users.ts` (tag `users`).

## Tests

`user-form-data.test.ts`; e2e en `e2e/ciclos-equipos.spec.ts` (alta, email repetido, integrante sin acceso).

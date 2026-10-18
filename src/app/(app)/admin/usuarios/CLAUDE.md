# Módulo admin/usuarios

`/admin/usuarios`: alta de usuarios, cambio de nombre/rol/estado y reseteo de contraseña. SOLO ADMIN: el resto recibe `notFound()` (con Cache Components el status HTTP queda en 200 porque el shell ya se envió, pero nunca se renderiza la lista) y en el menú ve "Usuarios" deshabilitado con la explicación. El back exige ADMIN en cada mutación.

## Archivos

| Archivo                       | Rol                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `page.tsx`                    | Contenedor server en `<Suspense>`: sesión + usuarios en paralelo; `notFound()` si no es ADMIN.                                 |
| `actions.ts`                  | `createUserAction`, `updateUserAction`, `resetPasswordAction`. `updateTag('users' / 'teams' / 'me')`.                          |
| `user-form-data.ts`           | Validación pura (email, rol; contraseña OPCIONAL 8–200 al crear). Al editarse a uno mismo no se envían rol ni `active`.        |
| `messages.ts`                 | Copy de errores (409 email repetido, 422 autocambio de rol/estado) y etiquetas de rol (Administración, **Líder**, Integrante). |
| `_components/users-table.tsx` | Presentacional. `_components/user-modals.tsx`: hojas `'use client'` (crear, editar, restablecer).                              |

## Reglas

- Las contraseñas nunca se devuelven en `FormState.values`.
- **Alta con clave generada**: la "Contraseña inicial" es opcional. En blanco, el back genera una segura y devuelve `initialPassword` UNA vez; `createUserAction` la pasa en `FormState.secret` (solo estado en memoria del cliente) y `CreateUserModal` NO se cierra solo: muestra "Usuario creado" con `OneTimeSecret` (aviso "se muestra una sola vez", copiar) y el botón "Ya la copié, cerrar". Se mantuvo el campo opcional (en vez de quitarlo) porque administración a veces ya acordó una clave con la persona; en ambos casos la persona debe cambiarla en su primer ingreso (`mustChangePassword`), y el reseteo también lo exige. Nunca se loguea ni se guarda.
- DAL: `src/lib/dal/users.ts` (tag `users`).
- Nombres: rol global LEADER = "Líder" (también en el menú de usuario, `_components/user-menu.tsx`); `TeamMember.isLead` = "Líder del equipo". No volver a "Liderazgo".

## Tests

`user-form-data.test.ts`, `user-modals.test.tsx` (clave generada una vez, copiar, descartar al cerrar); e2e `e2e/journeys/08-cambio-contrasena.spec.ts` y `e2e/ciclos-equipos.spec.ts` (alta, email repetido, integrante sin acceso).

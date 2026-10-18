import { SetMetadata } from '@nestjs/common';

export const ALLOW_PASSWORD_CHANGE_KEY = 'allowPasswordChange';

/**
 * Marca una ruta autenticada como accesible mientras la persona tiene `mustChangePassword`
 * (cambiar la clave, ver su perfil). Todas las demás responden 403 PASSWORD_CHANGE_REQUIRED.
 */
export const AllowPasswordChange = () => SetMetadata(ALLOW_PASSWORD_CHANGE_KEY, true);

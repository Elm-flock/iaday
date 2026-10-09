import { SetMetadata } from '@nestjs/common';
import { Role } from '../types/auth-user';

export const ROLES_KEY = 'roles';

/** Restringe la ruta a los roles indicados (lo evalúa el RolesGuard global). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

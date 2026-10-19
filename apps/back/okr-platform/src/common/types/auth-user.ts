export type Role = 'ADMIN' | 'LEADER' | 'MEMBER';

/** Usuario autenticado adjuntado al request por el JwtAuthGuard. */
export interface AuthUser {
  id: string;
  role: Role;
  /** true mientras la persona no cambie la clave inicial que le dio administración. */
  mustChangePassword?: boolean;
}

export type Role = 'ADMIN' | 'LEADER' | 'MEMBER';

/** Usuario autenticado adjuntado al request por el JwtAuthGuard. */
export interface AuthUser {
  id: string;
  role: Role;
}

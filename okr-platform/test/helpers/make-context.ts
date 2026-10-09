import { ExecutionContext } from '@nestjs/common';

/** Contexto HTTP mínimo para tests unitarios de guards. */
export function makeContext(
  request: Record<string, unknown>,
  meta: { isPublic?: boolean; roles?: string[] } = {},
): ExecutionContext {
  const handler = () => undefined;
  const cls = class {};
  Reflect.defineMetadata('isPublic', meta.isPublic, handler);
  Reflect.defineMetadata('roles', meta.roles, handler);
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

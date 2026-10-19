import { ExecutionContext, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiUserThrottlerGuard } from './ai-user-throttler.guard';
import { AiConfig } from './ai.config';

const ctx = (method: string, userId?: string, ip = '1.1.1.1') =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ method, ip, user: userId ? { id: userId } : undefined }),
    }),
  }) as unknown as ExecutionContext;

const guardWith = (limit: string) =>
  new AiUserThrottlerGuard(
    new AiConfig({
      get: (k: string) => (k === 'AI_THROTTLE_LIMIT' ? limit : undefined),
    } as unknown as ConfigService),
  );

describe('AiUserThrottlerGuard', () => {
  afterEach(() => jest.useRealTimers());

  it('deja pasar hasta el límite y corta con 429 AI_RATE_LIMITED', () => {
    const guard = guardWith('2');
    expect(guard.canActivate(ctx('POST', 'u1'))).toBe(true);
    expect(guard.canActivate(ctx('PATCH', 'u1'))).toBe(true);
    try {
      guard.canActivate(ctx('POST', 'u1'));
      throw new Error('debió lanzar');
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(429);
      expect((e as HttpException).getResponse()).toMatchObject({ code: 'AI_RATE_LIMITED' });
    }
  });

  it('cuenta por usuario, no por IP', () => {
    const guard = guardWith('1');
    expect(guard.canActivate(ctx('POST', 'u1'))).toBe(true);
    expect(guard.canActivate(ctx('POST', 'u2'))).toBe(true);
  });

  it('los GET no cuentan', () => {
    const guard = guardWith('1');
    for (let i = 0; i < 5; i++) expect(guard.canActivate(ctx('GET', 'u1'))).toBe(true);
  });

  it('la ventana es deslizante (60 s)', () => {
    jest.useFakeTimers();
    const guard = guardWith('1');
    expect(guard.canActivate(ctx('POST', 'u1'))).toBe(true);
    expect(() => guard.canActivate(ctx('POST', 'u1'))).toThrow(HttpException);
    jest.advanceTimersByTime(60_001);
    expect(guard.canActivate(ctx('POST', 'u1'))).toBe(true);
  });

  it('sin usuario cae a la IP', () => {
    const guard = guardWith('1');
    expect(guard.canActivate(ctx('POST', undefined, '9.9.9.9'))).toBe(true);
    expect(() => guard.canActivate(ctx('POST', undefined, '9.9.9.9'))).toThrow(HttpException);
  });
});

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { truncateAll } from './helpers/db';
import { createUser } from './helpers/factories';

/** Suite aparte: levanta su propia app (storage del throttler limpio) con el límite real de 5/min. */
describe('Auth throttling (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previousLimit = process.env.LOGIN_THROTTLE_LIMIT;

  beforeAll(async () => {
    delete process.env.LOGIN_THROTTLE_LIMIT; // vuelve al default de producción (5)
    ({ app, prisma } = await createTestApp());
    await truncateAll(prisma);
  });

  afterAll(async () => {
    if (previousLimit !== undefined) process.env.LOGIN_THROTTLE_LIMIT = previousLimit;
    await app.close();
  });

  it('brute force de login: 5 intentos fallidos pasan (401) y el 6to recibe 429 (REQ-AUTH-1)', async () => {
    const user = await createUser(prisma);
    const attempt = () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password: 'mala' });

    for (let i = 0; i < 5; i++) await attempt().expect(401);
    await attempt().expect(429);
  });
});

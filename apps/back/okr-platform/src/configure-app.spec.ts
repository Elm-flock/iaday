import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import request from 'supertest';
import { HealthController } from './health/health.controller';
import { configureApp } from './configure-app';

class EjemploDto {
  @IsString()
  nombre!: string;
}

@Controller('ejemplo')
class EjemploController {
  @Post()
  crear(@Body() dto: EjemploDto) {
    return dto;
  }
}

describe('configureApp (REQ-AUTH-2)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController, EjemploController],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health responde ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('campo extra en el body -> 400 (forbidNonWhitelisted)', async () => {
    await request(app.getHttpServer())
      .post('/ejemplo')
      .send({ nombre: 'a', extra: 'x' })
      .expect(400);
  });

  it('body válido -> 201', async () => {
    await request(app.getHttpServer()).post('/ejemplo').send({ nombre: 'a' }).expect(201);
  });
});

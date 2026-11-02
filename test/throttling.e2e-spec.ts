import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';

describe('Rate limiting global (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    // La configuración tipada se arma al crear la app, así que basta con cambiar process.env
    // antes. Jest aísla process.env por archivo de test.
    process.env.THROTTLE_LIMIT = '3';
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 429 con el formato único al superar el límite', async () => {
    const server = app.getHttpServer() as App;
    for (let i = 0; i < 3; i++) {
      await request(server).get('/api/v1/health/live').expect(200);
    }
    const res = await request(server).get('/api/v1/health/live').expect(429);
    expect(res.body.code).toBe('TOO_MANY_REQUESTS');
  });
});

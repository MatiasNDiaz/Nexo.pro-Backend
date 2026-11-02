import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from './utils/create-test-app';

const FRONTEND = 'http://localhost:3000';

describe('Bootstrap HTTP (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('health', () => {
    it('GET /api/v1/health/live responde ok sin datos internos', async () => {
      const res = await request(server).get('/api/v1/health/live').expect(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('GET /api/v1/health/ready responde ok con la base disponible', async () => {
      const res = await request(server).get('/api/v1/health/ready').expect(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('solo existe bajo el prefijo y la versión', async () => {
      await request(server).get('/health/live').expect(404);
      await request(server).get('/api/health/live').expect(404);
    });
  });

  describe('cabeceras de seguridad', () => {
    it('aplica Helmet, oculta X-Powered-By y agrega X-Request-Id', async () => {
      const res = await request(server).get('/api/v1/health/live');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('CORS', () => {
    it('permite el origen del frontend con credenciales en el preflight', async () => {
      const res = await request(server)
        .options('/api/v1/health/live')
        .set('Origin', FRONTEND)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,x-csrf-token,x-requested-with');
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(FRONTEND);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-allow-headers']).toContain('X-CSRF-Token');
    });

    it('no habilita un origen fuera de la lista (ni con comodín ni reflejándolo)', async () => {
      const res = await request(server)
        .options('/api/v1/health/live')
        .set('Origin', 'https://sitio-malicioso.example')
        .set('Access-Control-Request-Method', 'POST');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('formato de errores', () => {
    it('una ruta inexistente devuelve 404 con el formato único', async () => {
      const res = await request(server).get('/api/v1/no-existe').expect(404);
      expect(res.body).toEqual({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: expect.any(String),
        details: [],
        requestId: res.headers['x-request-id'],
        timestamp: expect.any(String),
      });
    });

    it('rechaza un body mayor al límite con 413', async () => {
      const res = await request(server)
        .post('/api/v1/health/live')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ data: 'x'.repeat(150 * 1024) }))
        .expect(413);
      expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('rechaza JSON mal formado con 400 y el formato único', async () => {
      const res = await request(server)
        .post('/api/v1/health/live')
        .set('Content-Type', 'application/json')
        .send('{"a":')
        .expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, code: 'BAD_REQUEST', details: [] });
      expect(res.body).not.toHaveProperty('stack');
    });
  });

  it('Swagger no se publica cuando SWAGGER_ENABLED=false', async () => {
    await request(server).get('/api/docs').expect(404);
  });
});

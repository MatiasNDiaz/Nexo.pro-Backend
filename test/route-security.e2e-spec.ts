import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { Client, FRONTEND, randomIp, signInCustomer } from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';

/**
 * Rutas que pueden responder sin sesión. Cualquier ruta nueva queda privada por defecto; si alguien
 * marca una con `@Public()` sin agregarla acá, este test falla (plan §13.1, T-01).
 */
const PUBLIC_ROUTES = new Set([
  'GET /api/v1/health/live',
  'GET /api/v1/health/ready',
  'GET /api/v1/locations/provinces',
  'GET /api/v1/locations/localities',
  'GET /api/v1/locations/neighborhoods',
  'GET /api/v1/professions',
  // Catálogo público (etapa 7.3).
  'GET /api/v1/catalog/professionals',
  'GET /api/v1/catalog/professionals/:slug',
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/mfa/verify',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/logout',
  'GET /api/v1/auth/csrf',
  'POST /api/v1/auth/email/verify',
  'POST /api/v1/auth/password/forgot',
  'POST /api/v1/auth/password/reset',
  // Archivos públicos del adaptador local (en producción los sirve Cloudinary).
  'GET /api/v1/uploads/:id/content',
  // Webhook del proveedor de identidad: autenticado por firma, no por sesión.
  'POST /api/v1/webhooks/identity',
]);

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

/** Lee las rutas registradas en Express (las que realmente sirve la app). */
function registeredRoutes(app: NestExpressApplication): Array<{ method: string; path: string }> {
  const express = app.getHttpAdapter().getInstance() as {
    router?: { stack: RouteLayer[] };
    _router?: { stack: RouteLayer[] };
  };
  const stack = (express.router ?? express._router)?.stack ?? [];
  return stack.flatMap((layer) =>
    // Nest registra comodines (`/api{/*splat}`, todos los métodos) para responder 404: no son endpoints.
    layer.route && !layer.route.path.includes('*')
      ? Object.keys(layer.route.methods)
          .filter((method) => method !== '_all')
          .map((method) => ({ method: method.toUpperCase(), path: layer.route?.path ?? '' }))
      : [],
  );
}

const concrete = (path: string) => path.replace(/:[A-Za-z]+/g, randomUUID());

describe('Seguridad de todas las rutas (e2e)', () => {
  let app: NestExpressApplication;
  let routes: Array<{ method: string; path: string }>;

  beforeAll(async () => {
    app = await createTestApp();
    routes = registeredRoutes(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('encuentra las rutas de la app y todas las públicas declaradas existen', () => {
    expect(routes.length).toBeGreaterThan(PUBLIC_ROUTES.size);
    const keys = new Set(routes.map((route) => `${route.method} ${route.path}`));
    for (const publicRoute of PUBLIC_ROUTES) expect(keys).toContain(publicRoute);
  });

  it('toda ruta no pública responde 401 sin sesión (denegación por defecto)', async () => {
    const privateRoutes = routes.filter(
      (route) => !PUBLIC_ROUTES.has(`${route.method} ${route.path}`),
    );
    expect(privateRoutes.length).toBeGreaterThan(5);
    const failures: string[] = [];
    for (const route of privateRoutes) {
      try {
        const res = await request(app.getHttpServer())
          [route.method.toLowerCase() as 'get'](concrete(route.path))
          .set('Origin', FRONTEND)
          .set('X-Requested-With', 'XMLHttpRequest')
          .set('X-Forwarded-For', randomIp())
          .send({});
        if (res.status !== 401) failures.push(`${route.method} ${route.path} → ${res.status}`);
      } catch (error) {
        failures.push(`${route.method} ${route.path} → ${(error as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('toda ruta /admin responde 403 a un cliente activo (el rol sale de la base)', async () => {
    const { client } = await signInCustomer(app);
    const adminRoutes = routes.filter((route) => route.path.startsWith('/api/v1/admin/'));
    expect(adminRoutes.length).toBeGreaterThan(0);
    const failures: string[] = [];
    for (const route of adminRoutes) {
      const path = concrete(route.path).replace('/api/v1', '');
      const res = await client.send(route.method, path, {
        reason: 'intento de escalada de privilegios',
      });
      if (res.status !== 403) failures.push(`${route.method} ${route.path} → ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('un cliente no puede cambiarse el rol ni el estado mandando campos de más', async () => {
    const { client } = await signInCustomer(app);
    const res = await client.post('/auth/password/change', {
      currentPassword: 'x',
      newPassword: 'una-contraseña-larga',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    expect(res.status).toBe(400);
    expect((await client.get('/auth/me')).body).toMatchObject({ role: 'CUSTOMER' });
  });

  it('el cliente HTTP de prueba no tiene sesión por defecto', async () => {
    expect((await new Client(app).get('/auth/me')).status).toBe(401);
  });
});

import type { NestExpressApplication } from '@nestjs/platform-express';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestApp } from './utils/create-test-app';
import { type Endpoint, endpointInventory, inventoryMarkdown } from './utils/endpoint-inventory';

const DOC = join(__dirname, '..', 'docs', 'endpoints.md');
const key = (e: Endpoint) => `${e.method} ${e.path}`;

/** Webhooks: autenticados por firma, sin sesión, Origin ni CSRF. */
const WEBHOOKS = ['POST /api/v1/webhooks/identity', 'POST /api/v1/webhooks/payments'];

/**
 * Rutas con sesión que no declaran rol (cualquier cuenta autenticada, también el admin): la cuenta
 * propia, la sesión y las notificaciones. Una ruta nueva sin @Roles hace fallar el test.
 */
const ANY_ROLE = [
  'POST /api/v1/auth/email/resend',
  'POST /api/v1/auth/logout-all',
  'GET /api/v1/auth/me',
  'POST /api/v1/auth/password/change',
  'POST /api/v1/auth/password/set',
  'GET /api/v1/auth/sessions',
  'DELETE /api/v1/auth/sessions/:id',
  'GET /api/v1/notifications',
  'POST /api/v1/notifications/:id/read',
  'POST /api/v1/notifications/read-all',
  'GET /api/v1/notifications/unread-count',
  // El servicio rechaza al admin (no se da de baja desde la API).
  'DELETE /api/v1/users/me',
];

/** Rutas que admiten cuentas suspendidas o baneadas (ADR 0007): ver el motivo, apelar y salir. */
const SANCTIONED_ALLOWED = [
  'POST /api/v1/auth/logout-all',
  'GET /api/v1/auth/me',
  'GET /api/v1/auth/sessions',
  'DELETE /api/v1/auth/sessions/:id',
  'POST /api/v1/moderation/appeals',
  'GET /api/v1/moderation/me',
];

/** Rutas públicas que modifican datos sin un límite propio (usan el global). */
const PUBLIC_WRITE_GLOBAL_LIMIT = ['POST /api/v1/auth/logout'];

describe('Inventario de endpoints (e2e, revisión de seguridad)', () => {
  let app: NestExpressApplication;
  let endpoints: Endpoint[];

  beforeAll(async () => {
    app = await createTestApp();
    endpoints = endpointInventory(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('docs/endpoints.md está al día', () => {
    const markdown = inventoryMarkdown(endpoints);
    if (process.env.UPDATE_ENDPOINTS === '1') writeFileSync(DOC, markdown, 'utf8');
    expect(readFileSync(DOC, 'utf8').replace(/\r\n/g, '\n')).toBe(markdown);
  });

  it('toda ruta /admin exige ADMIN activo', () => {
    const wrong = endpoints
      .filter((e) => e.path.startsWith('/api/v1/admin/'))
      .filter((e) => e.roles.join() !== 'ADMIN' || e.states.join() !== 'ACTIVE');
    expect(wrong.map(key)).toEqual([]);
  });

  it('toda ruta que modifica datos con sesión exige CSRF y Origin; solo los webhooks no', () => {
    const writes = endpoints.filter((e) => e.method !== 'GET');
    expect(writes.filter((e) => !e.originCheck).map(key)).toEqual(WEBHOOKS);
    expect(writes.filter((e) => !e.public && !e.csrf).map(key)).toEqual([]);
  });

  it('las rutas con sesión declaran el rol, salvo la lista revisada', () => {
    const anyRole = endpoints.filter((e) => !e.public && e.roles.length === 0).map(key);
    expect(anyRole.sort()).toEqual([...ANY_ROLE].sort());
  });

  it('solo la lista revisada admite cuentas suspendidas o baneadas', () => {
    const sanctioned = endpoints
      .filter((e) => e.states.includes('SUSPENDED') || e.states.includes('BANNED'))
      .map(key);
    expect(sanctioned.sort()).toEqual([...SANCTIONED_ALLOWED].sort());
  });

  it('las rutas públicas que modifican datos tienen un límite propio', () => {
    const unlimited = endpoints
      .filter((e) => e.public && e.method !== 'GET' && !e.throttle)
      .map(key);
    expect(unlimited).toEqual(PUBLIC_WRITE_GLOBAL_LIMIT);
  });
});

import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AdminAuditLog } from '../src/audit/entities/admin-audit-log.entity';
import { AuthSession } from '../src/auth/entities/auth-session.entity';
import { keyIdOf } from '../src/auth/services/token.service';
import { type AuthConfig, authConfig } from '../src/config/auth.config';
import { User } from '../src/users/entities/user.entity';
import { AccountStatus } from '../src/users/user.enums';
import {
  Client,
  FRONTEND,
  lastMailToken,
  parseSetCookies,
  PASSWORD,
  randomIp,
  registerCustomer,
  setStatus,
} from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';

/** Casos del plan §9.10 (autenticación con cookies) más los de la ADR 0002/0005/0007. */
describe('Autenticación con cookies (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let config: AuthConfig;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    config = app.get<AuthConfig>(authConfig.KEY);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Cliente activo y logueado. */
  async function signedIn(status = AccountStatus.ACTIVE) {
    const email = await registerCustomer(app);
    await setStatus(dataSource, email, status);
    const client = new Client(app);
    const res = await client.login(email);
    expect(res.status).toBe(200);
    return { client, email, loginResponse: res };
  }

  describe('login', () => {
    it('emite las 3 cookies HttpOnly, SameSite=Lax, con su Path, y ningún token en el body (§9.10 #1)', async () => {
      const { loginResponse } = await signedIn();
      const cookies = parseSetCookies(loginResponse.headers['set-cookie']);
      const access = cookies.get('nx_at');
      const refresh = cookies.get('nx_rt');
      const csrf = cookies.get('nx_csrf');
      for (const cookie of [access, refresh, csrf]) {
        expect(cookie?.attributes.httponly).toBe(true);
        expect(cookie?.attributes.samesite).toBe('Lax');
        expect(cookie?.attributes.domain).toBeUndefined();
        // En tests COOKIE_SECURE=false (HTTP local); en producción la validación exige Secure.
        expect(cookie?.attributes.secure).toBeUndefined();
      }
      expect(access?.attributes.path).toBe('/');
      expect(refresh?.attributes.path).toBe('/api/v1/auth');
      expect(Number(access?.attributes['max-age'])).toBe(600);
      expect(Number(refresh?.attributes['max-age'])).toBeGreaterThan(13 * 24 * 3600);

      const body = JSON.stringify(loginResponse.body);
      for (const cookie of [access, refresh, csrf]) expect(body).not.toContain(cookie?.value);
      expect(loginResponse.body.user).toMatchObject({ status: 'ACTIVE', role: 'CUSTOMER' });
      expect(loginResponse.body.user).not.toHaveProperty('passwordHash');
      expect(loginResponse.body.csrfToken).toMatch(/^[0-9a-f]{64}$/);
    });

    it('responde igual para email inexistente y contraseña incorrecta (§9.10 #2)', async () => {
      const email = await registerCustomer(app);
      const wrongPassword = await new Client(app).login(email, 'otra-contraseña');
      const unknownEmail = await new Client(app).login('nadie@example.com', 'otra-contraseña');
      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      const strip = (body: Record<string, unknown>) => ({
        ...body,
        requestId: null,
        timestamp: null,
      });
      expect(strip(wrongPassword.body as Record<string, unknown>)).toEqual(
        strip(unknownEmail.body as Record<string, unknown>),
      );
      expect(wrongPassword.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('bloquea la cuenta tras 5 fallos aunque cambie la IP, y se desbloquea al vencer (§9.10 #3)', async () => {
      const email = await registerCustomer(app);
      for (let i = 0; i < 5; i++) {
        expect((await new Client(app).login(email, 'incorrecta')).status).toBe(401);
      }
      // La contraseña correcta también falla mientras dura el bloqueo, con el mismo mensaje.
      const locked = await new Client(app).login(email);
      expect(locked.status).toBe(401);
      expect(locked.body.code).toBe('INVALID_CREDENTIALS');
      const user = await dataSource.getRepository(User).findOneByOrFail({ email });
      expect(user.lockedUntil).not.toBeNull();
      await expect(
        dataSource
          .getRepository(AdminAuditLog)
          .countBy({ action: 'ACCOUNT_LOCKED', targetId: user.id }),
      ).resolves.toBe(1);

      await dataSource
        .getRepository(User)
        .update({ email }, { lockedUntil: new Date(Date.now() - 1000) });
      expect((await new Client(app).login(email)).status).toBe(200);
    });

    it('limita los intentos por IP: el 6.º login en un minuto responde 429', async () => {
      const ip = randomIp();
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        statuses.push((await new Client(app, ip).login('nadie@example.com', 'x')).status);
      }
      expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    });

    it('rechaza el registro con rol ADMIN o con campos extra (§9.10 #14)', async () => {
      const client = new Client(app);
      const asAdmin = await client.post('/auth/register', {
        role: 'ADMIN',
        email: 'x@example.com',
      });
      expect(asAdmin.status).toBe(400);
      const extra = await client.post('/auth/login', {
        email: 'x@example.com',
        password: 'y',
        role: 'ADMIN',
      });
      expect(extra.status).toBe(400);
      expect(extra.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('requests autenticadas', () => {
    it('sin cookie → 401 UNAUTHORIZED (§9.10 #4)', async () => {
      const res = await new Client(app).get('/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('JWT vencido → 401 ACCESS_TOKEN_EXPIRED; firma inválida o alg none → 401 (§9.10 #4)', async () => {
      const { client } = await signedIn();
      const me = await client.get('/auth/me');
      const session = await dataSource
        .getRepository(AuthSession)
        .findOneByOrFail({ userId: me.body.id });
      const jwt = new JwtService();
      const sign = (secret: string, exp: number) =>
        jwt.sign(
          { sub: me.body.id, sid: session.id, exp },
          {
            secret,
            algorithm: 'HS256',
            keyid: keyIdOf(secret),
            issuer: config.jwt.issuer,
            audience: config.jwt.audience,
          },
        );
      const now = Math.floor(Date.now() / 1000);
      const call = (token: string) =>
        request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', `nx_at=${token}`);

      const expired = await call(sign(config.jwt.secret, now - 120));
      expect(expired.status).toBe(401);
      expect(expired.body.code).toBe('ACCESS_TOKEN_EXPIRED');

      const forged = await call(sign('x'.repeat(64), now + 600));
      expect(forged.status).toBe(401);

      const none = [
        Buffer.from(
          JSON.stringify({ alg: 'none', typ: 'JWT', kid: keyIdOf(config.jwt.secret) }),
        ).toString('base64url'),
        Buffer.from(
          JSON.stringify({
            sub: me.body.id,
            sid: session.id,
            exp: now + 600,
            iss: config.jwt.issuer,
            aud: config.jwt.audience,
          }),
        ).toString('base64url'),
        '',
      ].join('.');
      expect((await call(none)).status).toBe(401);

      // El token válido funciona: el 401 anterior no es por otro motivo.
      expect((await call(sign(config.jwt.secret, now + 600))).status).toBe(200);
    });

    it('dos usuarios con clientes separados no mezclan sesiones (§9.10 #10)', async () => {
      const a = await signedIn();
      const b = await signedIn();
      expect((await a.client.get('/auth/me')).body.email).toBe(a.email);
      expect((await b.client.get('/auth/me')).body.email).toBe(b.email);
    });
  });

  describe('refresh', () => {
    it('rota: el refresh viejo queda revocado y el nuevo funciona (§9.10 #5)', async () => {
      const { client } = await signedIn();
      const first = await client.post('/auth/refresh');
      expect(first.status).toBe(200);
      expect(first.body.csrfToken).toBe(client.csrfToken);
      const cookies = parseSetCookies(first.headers['set-cookie']);
      expect(cookies.get('nx_rt')?.value).toBeTruthy();
      expect(cookies.get('nx_at')?.value).toBeTruthy();
      expect((await client.get('/auth/me')).status).toBe(200);
      expect((await client.post('/auth/refresh')).status).toBe(200);
    });

    it('reutilizar un refresh ya rotado (fuera de la ventana de gracia) revoca toda la familia (§9.10 #6)', async () => {
      const { client, loginResponse } = await signedIn();
      const oldRefresh = parseSetCookies(loginResponse.headers['set-cookie']).get('nx_rt')?.value;
      expect((await client.post('/auth/refresh')).status).toBe(200);
      // Simula que pasaron más de 10 s desde la rotación.
      await dataSource.query(
        `UPDATE auth_sessions SET revoked_at = now() - interval '1 minute' WHERE revoke_reason = 'ROTATED' AND revoked_at > now() - interval '1 minute'`,
      );

      const attacker = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Origin', FRONTEND)
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('X-Forwarded-For', randomIp())
        .set('Cookie', `nx_rt=${oldRefresh}`);
      expect(attacker.status).toBe(401);
      expect(attacker.body.code).toBe('REFRESH_TOKEN_REUSED');

      // La sesión legítima de esa familia también cae (se revocó entera).
      expect((await client.get('/auth/me')).status).toBe(401);
      expect((await client.post('/auth/refresh')).status).toBe(401);
      await expect(
        dataSource.getRepository(AdminAuditLog).countBy({ action: 'REFRESH_TOKEN_REUSE' }),
      ).resolves.toBeGreaterThan(0);
    });

    it('dos pestañas refrescando a la vez no cierran la sesión (ventana de gracia)', async () => {
      const { client, loginResponse } = await signedIn();
      const oldRefresh = parseSetCookies(loginResponse.headers['set-cookie']).get('nx_rt')?.value;
      expect((await client.post('/auth/refresh')).status).toBe(200);
      const secondTab = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Origin', FRONTEND)
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('X-CSRF-Token', client.csrfToken)
        .set('Cookie', [
          `nx_rt=${oldRefresh}`,
          `nx_csrf=${parseSetCookies(loginResponse.headers['set-cookie']).get('nx_csrf')?.value}`,
        ]);
      expect(secondTab.status).toBe(200);
      // No rota de nuevo ni revoca: el cliente original sigue funcionando.
      expect(parseSetCookies(secondTab.headers['set-cookie']).has('nx_rt')).toBe(false);
      expect((await client.get('/auth/me')).status).toBe(200);
    });

    it('sin token CSRF el refresh se rechaza (§9.10 #9)', async () => {
      const { client } = await signedIn();
      const res = await client.agent.post('/api/v1/auth/refresh');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CSRF_INVALID');
    });
  });

  describe('CSRF y origen (§9.10 #9)', () => {
    it('POST sin Origin permitido, sin X-Requested-With o sin token CSRF → 403', async () => {
      const { client, loginResponse } = await signedIn();
      const server = app.getHttpServer();
      // Las cookies viajan igual (un sitio malicioso las haría enviar al navegador de la víctima).
      const cookie = [...parseSetCookies(loginResponse.headers['set-cookie'])]
        .map(([name, { value }]) => `${name}=${value}`)
        .join('; ');

      const badOrigin = await request(server)
        .post('/api/v1/auth/logout-all')
        .set('Origin', 'https://sitio-malicioso.example')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('X-CSRF-Token', client.csrfToken)
        .set('Cookie', cookie);
      expect(badOrigin.body.code).toBe('ORIGIN_NOT_ALLOWED');

      const noHeader = await client.agent
        .post('/api/v1/auth/logout-all')
        .unset('X-Requested-With')
        .set('X-CSRF-Token', client.csrfToken);
      expect(noHeader.body.code).toBe('MISSING_REQUESTED_WITH');

      const noCsrf = await client.agent.post('/api/v1/auth/logout-all');
      expect(noCsrf.status).toBe(403);
      expect(noCsrf.body.code).toBe('CSRF_INVALID');
      // Ninguna de las anteriores cerró la sesión.
      expect((await client.get('/auth/me')).status).toBe(200);
    });

    it('un token CSRF de otra sesión no sirve', async () => {
      const a = await signedIn();
      const b = await signedIn();
      const res = await a.client.agent
        .post('/api/v1/auth/logout-all')
        .set('X-CSRF-Token', b.client.csrfToken);
      expect(res.status).toBe(403);
    });

    it('GET /auth/csrf devuelve el token de la sesión después de recargar la página', async () => {
      const { client } = await signedIn();
      const res = await client.get('/auth/csrf');
      expect(res.status).toBe(200);
      expect(res.body.csrfToken).toBe(client.csrfToken);
      expect((await new Client(app).get('/auth/csrf')).status).toBe(401);
    });
  });

  describe('logout y sesiones', () => {
    it('logout revoca la sesión y borra las cookies con los mismos atributos (§9.10 #7)', async () => {
      const { client, loginResponse } = await signedIn();
      const access = parseSetCookies(loginResponse.headers['set-cookie']).get('nx_at')?.value;
      const res = await client.post('/auth/logout');
      expect(res.status).toBe(204);
      const cleared = parseSetCookies(res.headers['set-cookie']);
      expect(cleared.get('nx_rt')?.attributes.path).toBe('/api/v1/auth');
      expect(cleared.get('nx_at')?.attributes.path).toBe('/');
      for (const name of ['nx_at', 'nx_rt', 'nx_csrf']) {
        expect(cleared.get(name)?.value).toBe('');
        expect(cleared.get(name)?.attributes.httponly).toBe(true);
        expect(cleared.get(name)?.attributes.samesite).toBe('Lax');
      }
      // El access token anterior deja de servir aunque no haya vencido (se valida el sid).
      const reused = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', `nx_at=${access}`);
      expect(reused.status).toBe(401);
    });

    it('logout-all invalida las sesiones de otros dispositivos (§9.10 #8)', async () => {
      const email = await registerCustomer(app);
      await setStatus(dataSource, email, AccountStatus.ACTIVE);
      const laptop = new Client(app);
      const phone = new Client(app);
      await laptop.login(email);
      await phone.login(email);
      expect((await laptop.post('/auth/logout-all')).status).toBe(204);
      expect((await phone.get('/auth/me')).status).toBe(401);
    });

    it('lista y cierra dispositivos propios; el de otro usuario da 404', async () => {
      const email = await registerCustomer(app);
      await setStatus(dataSource, email, AccountStatus.ACTIVE);
      const laptop = new Client(app);
      const phone = new Client(app);
      await laptop.login(email);
      await phone.login(email);
      const list = await laptop.get('/auth/sessions');
      expect(list.body).toHaveLength(2);
      const other = (list.body as Array<{ id: string; current: boolean }>).find((s) => !s.current);
      expect((await laptop.delete(`/auth/sessions/${other?.id}`)).status).toBe(204);
      expect((await phone.get('/auth/me')).status).toBe(401);

      const stranger = await signedIn();
      const mine = (await laptop.get('/auth/sessions')).body as Array<{ id: string }>;
      expect((await stranger.client.delete(`/auth/sessions/${mine[0]?.id}`)).status).toBe(404);
      expect((await laptop.get('/auth/me')).status).toBe(200);
    });
  });

  describe('estados de cuenta (ADR 0007)', () => {
    it('una cuenta suspendida solo ve su estado y cierra sesión (§9.10 #12)', async () => {
      const { client } = await signedIn(AccountStatus.SUSPENDED);
      const me = await client.get('/auth/me');
      expect(me.status).toBe(200);
      expect(me.body.status).toBe('SUSPENDED');
      const resend = await client.post('/auth/email/resend');
      expect(resend.status).toBe(403);
      expect(resend.body.code).toBe('ACCOUNT_STATE_NOT_ALLOWED');
      expect((await client.post('/auth/logout')).status).toBe(204);
    });

    it('una cuenta pendiente de verificación no opera: rutas de cuenta activa → 403 (§9.10 #13)', async () => {
      const { client } = await signedIn(AccountStatus.PENDING_VERIFICATION);
      expect((await client.get('/auth/me')).status).toBe(200);
      const res = await client.post(
        `/admin/users/${(await client.get('/auth/me')).body.id}/password-reset`,
        { reason: 'motivo suficientemente largo' },
      );
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCOUNT_STATE_NOT_ALLOWED');
    });

    it('una cuenta dada de baja no puede iniciar sesión', async () => {
      const email = await registerCustomer(app);
      await setStatus(dataSource, email, AccountStatus.DEACTIVATED);
      const res = await new Client(app).login(email);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('email y contraseña', () => {
    it('verifica el email con el enlace de un solo uso (ADR 0005)', async () => {
      const email = await registerCustomer(app);
      const token = lastMailToken(app, email);
      const client = new Client(app);
      expect((await client.post('/auth/email/verify', { token })).status).toBe(204);
      expect((await client.post('/auth/email/verify', { token })).status).toBe(400);
      await client.login(email);
      expect((await client.get('/auth/me')).body.emailVerified).toBe(true);
    });

    it('el "olvidé mi contraseña" autoservicio está apagado (ADR 0002)', async () => {
      const res = await new Client(app).post('/auth/password/forgot', { email: 'x@example.com' });
      expect(res.status).toBe(404);
    });

    it('cambiar la contraseña exige la actual y cierra los demás dispositivos', async () => {
      const email = await registerCustomer(app);
      await setStatus(dataSource, email, AccountStatus.ACTIVE);
      const laptop = new Client(app);
      const phone = new Client(app);
      await laptop.login(email);
      await phone.login(email);
      const wrong = await laptop.post('/auth/password/change', {
        currentPassword: 'no-es',
        newPassword: 'nueva-contraseña-larga',
      });
      expect(wrong.status).toBe(400);
      const ok = await laptop.post('/auth/password/change', {
        currentPassword: PASSWORD,
        newPassword: 'nueva-contraseña-larga',
      });
      expect(ok.status).toBe(204);
      expect((await laptop.get('/auth/me')).status).toBe(200);
      expect((await phone.get('/auth/me')).status).toBe(401);
      expect((await new Client(app).login(email, 'nueva-contraseña-larga')).status).toBe(200);
    });

    it('rechaza una contraseña nueva igual al email o demasiado corta', async () => {
      const { client, email } = await signedIn();
      const same = await client.post('/auth/password/change', {
        currentPassword: PASSWORD,
        newPassword: email,
      });
      expect(same.body.code).toBe('WEAK_PASSWORD');
      const short = await client.post('/auth/password/change', {
        currentPassword: PASSWORD,
        newPassword: 'corta',
      });
      expect(short.status).toBe(400);
    });
  });
});

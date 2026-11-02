import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { AdminAuditLog } from '../src/audit/entities/admin-audit-log.entity';
import { OneTimeToken } from '../src/auth/entities/one-time-token.entity';
import { User } from '../src/users/entities/user.entity';
import { AccountStatus } from '../src/users/user.enums';
import {
  Client,
  createAdmin,
  lastMailToken,
  parseSetCookies,
  registerCustomer,
  setStatus,
} from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';

/** Segundo factor del admin y recuperación de contraseña disparada por el admin (ADR 0002). */
describe('Admin: MFA y reset de contraseña (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  async function signedInAdmin() {
    const admin = await createAdmin(app);
    const client = new Client(app);
    const step1 = await client.login(admin.email, admin.password);
    expect(step1.body).toEqual({ mfaRequired: true });
    const step2 = await client.post('/auth/mfa/verify', { code: await admin.totp() });
    expect(step2.status).toBe(200);
    client.csrfToken = step2.body.csrfToken as string;
    return { admin, client };
  }

  describe('login del admin', () => {
    it('la contraseña sola no da sesión: pide el segundo factor', async () => {
      const admin = await createAdmin(app);
      const client = new Client(app);
      const res = await client.login(admin.email, admin.password);
      const cookies = parseSetCookies(res.headers['set-cookie']);
      expect(res.body).toEqual({ mfaRequired: true });
      expect(cookies.has('nx_at')).toBe(false);
      expect(cookies.get('nx_mfa')?.attributes.httponly).toBe(true);
      expect(cookies.get('nx_mfa')?.attributes.path).toBe('/api/v1/auth/mfa');
      expect((await client.get('/auth/me')).status).toBe(401);
    });

    it('con el código TOTP correcto emite la sesión (access de 5 min) y lo audita', async () => {
      const { admin, client } = await signedInAdmin();
      expect((await client.get('/auth/me')).body).toMatchObject({ role: 'ADMIN' });
      await expect(
        dataSource
          .getRepository(AdminAuditLog)
          .countBy({ action: 'ADMIN_LOGIN', actorId: admin.id }),
      ).resolves.toBe(1);
    });

    it('el access token del admin dura 5 minutos', async () => {
      const admin = await createAdmin(app);
      const client = new Client(app);
      await client.login(admin.email, admin.password);
      const res = await client.post('/auth/mfa/verify', { code: await admin.totp() });
      expect(parseSetCookies(res.headers['set-cookie']).get('nx_at')?.attributes['max-age']).toBe(
        '300',
      );
    });

    it('rechaza un código incorrecto y no permite reutilizar uno ya usado', async () => {
      const admin = await createAdmin(app);
      const client = new Client(app);
      await client.login(admin.email, admin.password);
      expect((await client.post('/auth/mfa/verify', { code: '000000' })).status).toBe(401);
      const code = await admin.totp();
      expect((await client.post('/auth/mfa/verify', { code })).status).toBe(200);

      const replay = new Client(app);
      await replay.login(admin.email, admin.password);
      const res = await replay.post('/auth/mfa/verify', { code });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_MFA');
    });

    it('un código de recuperación funciona una sola vez', async () => {
      const admin = await createAdmin(app);
      const recoveryCode = admin.enrollment.recoveryCodes[0] ?? '';
      const first = new Client(app);
      await first.login(admin.email, admin.password);
      expect((await first.post('/auth/mfa/verify', { recoveryCode })).status).toBe(200);
      const second = new Client(app);
      await second.login(admin.email, admin.password);
      expect((await second.post('/auth/mfa/verify', { recoveryCode })).status).toBe(401);
    });

    it('sin el paso de contraseña previo, /auth/mfa/verify no sirve', async () => {
      const admin = await createAdmin(app);
      const res = await new Client(app).post('/auth/mfa/verify', { code: await admin.totp() });
      expect(res.status).toBe(401);
    });
  });

  describe('reset de contraseña disparado por el admin (ADR 0002)', () => {
    it('envía un enlace de un solo uso; al usarlo cierra todas las sesiones del usuario (§9.10 #11)', async () => {
      const { client: adminClient } = await signedInAdmin();
      const email = await registerCustomer(app);
      await setStatus(dataSource, email, AccountStatus.ACTIVE);
      const userClient = new Client(app);
      await userClient.login(email);
      const user = await dataSource.getRepository(User).findOneByOrFail({ email });

      const noReason = await adminClient.post(`/admin/users/${user.id}/password-reset`, {});
      expect(noReason.status).toBe(400);

      const reason = 'El usuario lo pidió por teléfono y validé su identidad';
      const sent = await adminClient.post(`/admin/users/${user.id}/password-reset`, { reason });
      expect(sent.status).toBe(202);
      // El admin nunca ve la contraseña ni el token: solo un mensaje.
      expect(JSON.stringify(sent.body)).not.toMatch(/token|password/i);
      await expect(
        dataSource
          .getRepository(AdminAuditLog)
          .countBy({ action: 'ADMIN_PASSWORD_RESET_REQUESTED', targetId: user.id, reason }),
      ).resolves.toBe(1);

      const token = lastMailToken(app, email);
      expect(
        (
          await new Client(app).post('/auth/password/reset', {
            token,
            newPassword: 'nueva-contraseña-123',
          })
        ).status,
      ).toBe(204);
      expect((await userClient.get('/auth/me')).status).toBe(401);
      expect(
        (
          await new Client(app).post('/auth/password/reset', {
            token,
            newPassword: 'otra-contraseña-123',
          })
        ).status,
      ).toBe(400);
      expect((await new Client(app).login(email, 'nueva-contraseña-123')).status).toBe(200);
    });

    it('un enlace vencido no sirve', async () => {
      const { client: adminClient } = await signedInAdmin();
      const email = await registerCustomer(app);
      const user = await dataSource.getRepository(User).findOneByOrFail({ email });
      await adminClient.post(`/admin/users/${user.id}/password-reset`, {
        reason: 'Prueba de enlace vencido',
      });
      const token = lastMailToken(app, email);
      await dataSource
        .getRepository(OneTimeToken)
        .update(
          { userId: user.id, type: 'PASSWORD_RESET' as never },
          { expiresAt: new Date(Date.now() - 1000) },
        );
      const res = await new Client(app).post('/auth/password/reset', {
        token,
        newPassword: 'nueva-contraseña-123',
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    it('un cliente activo no puede usar el endpoint del admin (403)', async () => {
      const email = await registerCustomer(app);
      await setStatus(dataSource, email, AccountStatus.ACTIVE);
      const client = new Client(app);
      await client.login(email);
      const me = await client.get('/auth/me');
      const res = await client.post(`/admin/users/${me.body.id}/password-reset`, {
        reason: 'intento de escalada',
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('un usuario inexistente da 404', async () => {
      const { client } = await signedInAdmin();
      const res = await client.post(
        '/admin/users/00000000-0000-4000-8000-000000000000/password-reset',
        { reason: 'usuario inexistente' },
      );
      expect(res.status).toBe(404);
    });
  });
});

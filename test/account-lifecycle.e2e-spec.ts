import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource, IsNull } from 'typeorm';
import { AdminAuditLog } from '../src/audit/entities/admin-audit-log.entity';
import { AuthSession } from '../src/auth/entities/auth-session.entity';
import { ProfessionalProfile } from '../src/professionals/entities/professional-profile.entity';
import { User } from '../src/users/entities/user.entity';
import { AccountStatus, VerificationStatus } from '../src/users/user.enums';
import {
  Client,
  cordobaLocalityId,
  customerPayload,
  parseSetCookies,
  PASSWORD,
  professionId,
  signInAdmin,
  signInCustomer,
  uniqueEmail,
} from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';

const REASON = 'Motivo de prueba suficientemente largo';

/** Etapa 6: estados de cuenta, cambio de rol, revocación y baja (ADR 0007, 0012, 0013, 0014). */
describe('Ciclo de vida de la cuenta (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let admin: Client;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    admin = (await signInAdmin(app)).client;
  });

  afterAll(async () => {
    await app.close();
  });

  const userById = (id: string) =>
    dataSource.getRepository(User).findOneOrFail({ where: { id }, withDeleted: true });
  const auditCount = (action: string, targetId: string) =>
    dataSource.getRepository(AdminAuditLog).countBy({ action, targetId });

  describe('suspensión, baneo y restauración', () => {
    it('suspender revoca las sesiones; el usuario ve el motivo y solo puede ver su cuenta (§9.10 #15)', async () => {
      const user = await signInCustomer(app);
      const res = await admin.post(`/admin/users/${user.id}/suspend`, { reason: REASON });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: user.id, role: 'CUSTOMER', status: 'SUSPENDED' });
      expect((await user.client.get('/auth/me')).status).toBe(401);
      await expect(auditCount('ACCOUNT_SUSPENDED', user.id)).resolves.toBe(1);

      const again = new Client(app);
      await again.login(user.email);
      const me = await again.get('/auth/me');
      expect(me.body).toMatchObject({ status: 'SUSPENDED', statusReason: REASON });
      expect((await again.post('/auth/email/resend')).status).toBe(403);
    });

    it('restaurar vuelve a ACTIVE solo si la identidad está aprobada', async () => {
      const pending = await signInCustomer(app, AccountStatus.PENDING_VERIFICATION);
      await admin.post(`/admin/users/${pending.id}/suspend`, { reason: REASON });
      const restored = await admin.post(`/admin/users/${pending.id}/restore`, { reason: REASON });
      expect(restored.body.status).toBe('PENDING_VERIFICATION');

      const verified = await signInCustomer(app);
      await dataSource
        .getRepository(User)
        .update(verified.id, { verificationStatus: VerificationStatus.APPROVED });
      await admin.post(`/admin/users/${verified.id}/ban`, { reason: REASON });
      const back = await admin.post(`/admin/users/${verified.id}/restore`, { reason: REASON });
      expect(back.body.status).toBe('ACTIVE');
      expect((await userById(verified.id)).statusReason).toBeNull();
    });

    it('rechaza transiciones inválidas, acciones sin motivo y acciones sobre el admin', async () => {
      const user = await signInCustomer(app);
      expect((await admin.post(`/admin/users/${user.id}/restore`, { reason: REASON })).status).toBe(
        409,
      );
      expect((await admin.post(`/admin/users/${user.id}/suspend`, {})).status).toBe(400);
      expect(
        (await admin.post(`/admin/users/${user.id}/suspend`, { reason: 'corto' })).status,
      ).toBe(400);

      const other = await signInAdmin(app);
      const res = await admin.post(`/admin/users/${other.admin.id}/ban`, { reason: REASON });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CANNOT_MODIFY_ADMIN');
    });
  });

  describe('cambio de rol (ADR 0012)', () => {
    it('cliente → profesional → cliente → profesional: revoca sesiones y reutiliza el perfil inactivo', async () => {
      const user = await signInCustomer(app);
      const localityId = await cordobaLocalityId(user.client);
      const profession = await professionId(user.client);

      const missing = await admin.post(`/admin/users/${user.id}/change-role`, {
        reason: REASON,
        role: 'PROFESSIONAL',
      });
      expect(missing.body.code).toBe('PROFESSIONAL_DATA_REQUIRED');

      const toPro = await admin.post(`/admin/users/${user.id}/change-role`, {
        reason: REASON,
        role: 'PROFESSIONAL',
        professionId: profession,
        serviceAreas: [{ localityId }],
      });
      expect(toPro.body).toMatchObject({ role: 'PROFESSIONAL' });
      expect((await user.client.get('/auth/me')).status).toBe(401);
      const profile = await dataSource
        .getRepository(ProfessionalProfile)
        .findOneByOrFail({ userId: user.id });
      expect(profile.deactivatedAt).toBeNull();

      // Ya tenía barrio como cliente: no hace falta mandarlo de nuevo.
      await admin.post(`/admin/users/${user.id}/change-role`, { reason: REASON, role: 'CUSTOMER' });
      const inactive = await dataSource
        .getRepository(ProfessionalProfile)
        .findOneByOrFail({ userId: user.id });
      expect(inactive.deactivatedAt).not.toBeNull();

      await admin.post(`/admin/users/${user.id}/change-role`, {
        reason: REASON,
        role: 'PROFESSIONAL',
      });
      const reactivated = await dataSource
        .getRepository(ProfessionalProfile)
        .findOneByOrFail({ userId: user.id });
      expect(reactivated.id).toBe(profile.id);
      expect(reactivated.deactivatedAt).toBeNull();
      await expect(auditCount('ROLE_CHANGED', user.id)).resolves.toBe(3);
    });

    it('un profesional que nunca fue cliente necesita barrio para pasar a cliente; mismo rol → 409', async () => {
      const client = new Client(app);
      const localityId = await cordobaLocalityId(client);
      const email = uniqueEmail('pro');
      await client.post('/auth/register', {
        role: 'PROFESSIONAL',
        email,
        password: PASSWORD,
        firstName: 'Juan',
        lastName: 'Gómez',
        phone: '3511234567',
        professionId: await professionId(client),
        serviceAreas: [{ localityId }],
      });
      const pro = await dataSource.getRepository(User).findOneByOrFail({ email });
      expect(
        (
          await admin.post(`/admin/users/${pro.id}/change-role`, {
            reason: REASON,
            role: 'PROFESSIONAL',
          })
        ).status,
      ).toBe(409);
      const noBarrio = await admin.post(`/admin/users/${pro.id}/change-role`, {
        reason: REASON,
        role: 'CUSTOMER',
      });
      expect(noBarrio.body.code).toBe('NEIGHBORHOOD_REQUIRED');
      const ok = await admin.post(`/admin/users/${pro.id}/change-role`, {
        reason: REASON,
        role: 'CUSTOMER',
        neighborhood: { localityId, name: 'Barrio Nuevo Por Cambio' },
      });
      expect(ok.body.role).toBe('CUSTOMER');
    });

    it('no permite convertir a nadie en ADMIN', async () => {
      const user = await signInCustomer(app);
      const res = await admin.post(`/admin/users/${user.id}/change-role`, {
        reason: REASON,
        role: 'ADMIN',
      });
      expect(res.status).toBe(400);
    });
  });

  it('cuenta comprometida (ADR 0014): el admin cierra todos sus dispositivos', async () => {
    const user = await signInCustomer(app);
    const second = new Client(app);
    await second.login(user.email);
    expect(
      (await admin.post(`/admin/users/${user.id}/revoke-sessions`, { reason: REASON })).status,
    ).toBe(204);
    expect((await user.client.get('/auth/me')).status).toBe(401);
    expect((await second.get('/auth/me')).status).toBe(401);
    await expect(auditCount('SESSIONS_REVOKED', user.id)).resolves.toBe(1);
  });

  describe('baja con anonimización (ADR 0013)', () => {
    it('la baja propia exige la contraseña, borra los datos personales y cierra la sesión', async () => {
      const user = await signInCustomer(app);
      expect((await user.client.delete('/users/me').send({ password: 'incorrecta' })).status).toBe(
        400,
      );
      const res = await user.client.delete('/users/me').send({ password: PASSWORD });
      expect(res.status).toBe(204);
      expect(parseSetCookies(res.headers['set-cookie']).get('nx_at')?.value).toBe('');

      const stored = await userById(user.id);
      expect(stored).toMatchObject({
        email: `deleted-${user.id}@deleted.invalid`,
        firstName: 'Cuenta',
        lastName: 'eliminada',
        phone: '',
        neighborhoodId: null,
        status: AccountStatus.DEACTIVATED,
      });
      expect(stored.deletedAt).not.toBeNull();
      await expect(
        dataSource.getRepository(AuthSession).countBy({ userId: user.id, revokedAt: IsNull() }),
      ).resolves.toBe(0);
      expect((await new Client(app).login(user.email)).status).toBe(401);
      await expect(auditCount('ACCOUNT_DELETED', user.id)).resolves.toBe(1);

      // El email queda libre para una cuenta nueva.
      const client = new Client(app);
      const again = await client.post(
        '/auth/register',
        customerPayload(user.email, await cordobaLocalityId(client)),
      );
      expect(again.status).toBe(202);
      await expect(dataSource.getRepository(User).countBy({ email: user.email })).resolves.toBe(1);
    });

    it('una cuenta suspendida no puede darse de baja sola', async () => {
      const user = await signInCustomer(app, AccountStatus.SUSPENDED);
      const res = await user.client.delete('/users/me').send({ password: PASSWORD });
      expect(res.status).toBe(403);
    });

    it('el admin puede dar de baja una cuenta (con motivo) y no se puede repetir', async () => {
      const user = await signInCustomer(app);
      expect((await admin.delete(`/admin/users/${user.id}`).send({ reason: REASON })).status).toBe(
        204,
      );
      expect((await user.client.get('/auth/me')).status).toBe(401);
      expect((await admin.delete(`/admin/users/${user.id}`).send({ reason: REASON })).status).toBe(
        404,
      );
    });
  });
});

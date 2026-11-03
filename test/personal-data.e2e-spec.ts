import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { AdminAuditLog } from '../src/audit/entities/admin-audit-log.entity';
import {
  IdentityVerification,
  VerificationKind,
} from '../src/identity-verification/entities/identity-verification.entity';
import { User } from '../src/users/entities/user.entity';
import { AccountStatus, VerificationStatus } from '../src/users/user.enums';
import {
  type Client,
  cordobaLocalityId,
  signInAdmin,
  signInCustomer,
  signInProfessional,
} from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';
import { PNG_BYTES, uploadFile } from './utils/uploads';

/** ADR 0021: edición de datos personales propia y por el admin. */
describe('Datos personales (e2e)', () => {
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

  const user = (id: string) => dataSource.getRepository(User).findOneByOrFail({ id });
  const approve = (id: string) =>
    dataSource.getRepository(User).update(id, { verificationStatus: VerificationStatus.APPROVED });
  const openReview = (userId: string) =>
    dataSource.getRepository(IdentityVerification).findOneBy({
      userId,
      kind: VerificationKind.PROFILE_CHANGE,
      status: VerificationStatus.REQUIRES_REVIEW,
    });
  const decide = (id: string, decision: string) =>
    admin.post(`/admin/identity-verifications/${id}/decision`, {
      decision,
      reason: 'Revisión del cambio de datos',
    });

  it('antes de verificar la identidad, todo se cambia directamente', async () => {
    const { client, id } = await signInCustomer(app, AccountStatus.PENDING_VERIFICATION);
    const localityId = await cordobaLocalityId(client);
    const res = await client.patch('/users/me', {
      firstName: 'María José',
      phone: '+54 9 351 555-0000',
      neighborhood: { localityId, name: 'alta córdoba' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      firstName: 'María José',
      pendingFirstName: null,
      phone: '+5493515550000',
      neighborhoodName: 'Alta Córdoba',
      nameUnderReview: false,
    });
    expect((await user(id)).firstName).toBe('María José');
  });

  it('con la identidad aprobada, el nombre queda en revisión y se ve el anterior', async () => {
    const { client, id } = await signInCustomer(app);
    await approve(id);
    const res = await client.patch('/users/me', { lastName: 'Fernández', phone: '3519998888' });
    expect(res.body).toMatchObject({
      lastName: 'Pérez',
      pendingLastName: 'Fernández',
      pendingFirstName: 'Ana',
      phone: '3519998888',
      nameUnderReview: true,
    });
    const me = (await client.get('/auth/me')).body;
    expect(me).toMatchObject({
      lastName: 'Pérez',
      status: 'ACTIVE',
      verificationStatus: 'REQUIRES_REVIEW',
    });

    const review = await openReview(id);
    expect((await decide(review!.id, 'APPROVE')).status).toBe(200);
    expect(await user(id)).toMatchObject({
      lastName: 'Fernández',
      pendingLastName: null,
      verificationStatus: VerificationStatus.APPROVED,
    });
  });

  it('el rechazo conserva el nombre anterior; foto y nombre van en la misma revisión', async () => {
    const { client, id } = await signInCustomer(app);
    await approve(id);
    await client.patch('/users/me', { firstName: 'Otra' });
    const fileId = await uploadFile(client, PNG_BYTES, { purpose: 'AVATAR', kind: 'IMAGE' });
    expect((await client.put('/users/me/avatar', { fileId })).body.underReview).toBe(true);
    expect(
      await dataSource
        .getRepository(IdentityVerification)
        .countBy({ userId: id, kind: VerificationKind.PROFILE_CHANGE }),
    ).toBe(1);

    const review = await openReview(id);
    await decide(review!.id, 'REJECT');
    expect(await user(id)).toMatchObject({
      firstName: 'Ana',
      pendingFirstName: null,
      pendingAvatarFileId: null,
      verificationStatus: VerificationStatus.APPROVED,
    });
  });

  it('volver al nombre aprobado retira el cambio y cierra la revisión', async () => {
    const { client, id } = await signInCustomer(app);
    await approve(id);
    await client.patch('/users/me', { firstName: 'Anita' });
    const back = await client.patch('/users/me', { firstName: 'Ana' });
    expect(back.body).toMatchObject({ pendingFirstName: null, nameUnderReview: false });
    expect(await openReview(id)).toBeNull();
    expect((await user(id)).verificationStatus).toBe(VerificationStatus.APPROVED);
  });

  it('el barrio es solo de clientes', async () => {
    const { client } = await signInProfessional(app);
    const localityId = await cordobaLocalityId(client);
    const res = await client.patch('/users/me', { neighborhood: { localityId, name: 'Centro' } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FIELD_NOT_ALLOWED');
    expect((await client.patch('/users/me', { phone: 'abc' })).status).toBe(400);
  });

  describe('el admin', () => {
    it('edita los datos directamente, con motivo y auditoría (sin los valores)', async () => {
      const { id } = await signInCustomer(app);
      expect((await admin.patch(`/admin/users/${id}`, { phone: '3510000000' })).status).toBe(400);
      const res = await admin.patch(`/admin/users/${id}`, {
        firstName: 'Ana María',
        phone: '3510000000',
        extraInfo: 'Llamar antes de ir',
        reason: 'Pedido del cliente por soporte',
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ firstName: 'Ana María', phone: '3510000000' });
      const log = await dataSource
        .getRepository(AdminAuditLog)
        .findOneByOrFail({ targetId: id, action: 'USER_DATA_UPDATED' });
      expect(log.metadata).toEqual({ fields: 'firstName,phone,extraInfo' });
      expect(JSON.stringify(log)).not.toContain('3510000000');
    });

    it('su cambio de nombre reemplaza al pendiente y cierra la revisión', async () => {
      const { client, id } = await signInCustomer(app);
      await approve(id);
      await client.patch('/users/me', { firstName: 'Pendiente' });
      await admin.patch(`/admin/users/${id}`, {
        firstName: 'Corregido',
        reason: 'Corrección acordada con la persona',
      });
      expect(await user(id)).toMatchObject({
        firstName: 'Corregido',
        pendingFirstName: null,
        verificationStatus: VerificationStatus.APPROVED,
      });
      expect(await openReview(id)).toBeNull();
    });

    it('edita el perfil de un profesional con auditoría; no toca cuentas de admin', async () => {
      const { id } = await signInProfessional(app);
      const res = await admin.patch(`/admin/professionals/${id}/profile`, {
        bio: 'Texto corregido por soporte',
        reason: 'El profesional pidió ayuda con su perfil',
      });
      expect(res.status).toBe(200);
      expect(res.body.bio).toBe('Texto corregido por soporte');
      expect(
        await dataSource
          .getRepository(AdminAuditLog)
          .countBy({ targetId: id, action: 'PROFESSIONAL_PROFILE_UPDATED' }),
      ).toBe(1);

      const other = await signInAdmin(app);
      const denied = await admin.patch(`/admin/users/${other.admin.id}`, {
        phone: '3511111111',
        reason: 'Intento sobre otra cuenta de admin',
      });
      expect(denied.body.code).toBe('CANNOT_MODIFY_ADMIN');
    });
  });
});

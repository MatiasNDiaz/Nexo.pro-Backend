import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AdminAuditLog, AuditResult } from '../src/audit/entities/admin-audit-log.entity';
import { IdentityProviderEvent } from '../src/identity-verification/entities/identity-provider-event.entity';
import {
  IdentityVerification,
  VerificationKind,
} from '../src/identity-verification/entities/identity-verification.entity';
import { IdentityVerificationService } from '../src/identity-verification/identity-verification.service';
import type { FakeIdentityProvider } from '../src/integrations/identity/fake-identity.provider';
import { IDENTITY_PROVIDER } from '../src/integrations/identity/identity-verification.provider';
import { User } from '../src/users/entities/user.entity';
import { StoredFile } from '../src/uploads/entities/stored-file.entity';
import { FileStatus } from '../src/uploads/file.enums';
import { AccountStatus, VerificationStatus } from '../src/users/user.enums';
import { type Client, signInAdmin, signInCustomer } from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';
import { customerReadyForVerification, PNG_BYTES, uploadFile } from './utils/uploads';

describe('Verificación de identidad (e2e, proveedor simulado)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let fake: FakeIdentityProvider;
  let service: IdentityVerificationService;
  let admin: Client;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    fake = app.get<FakeIdentityProvider>(IDENTITY_PROVIDER);
    service = app.get(IdentityVerificationService);
    admin = (await signInAdmin(app)).client;
  });

  afterAll(async () => {
    await app.close();
  });

  const userRow = (id: string) =>
    dataSource
      .getRepository(User)
      .findOneByOrFail({ id })
      .then((u) => ({ status: u.status, verificationStatus: u.verificationStatus }));

  const referenceOf = async (verificationId: string) =>
    (await dataSource.getRepository(IdentityVerification).findOneByOrFail({ id: verificationId }))
      .providerReference ?? '';

  /** Manda por HTTP un webhook firmado, como el proveedor. */
  const sendWebhook = (providerReference: string, eventId: string = randomUUID()) => {
    const hook = fake.buildSignedWebhook({ eventId, providerReference });
    return request(app.getHttpServer())
      .post('/api/v1/webhooks/identity')
      .set('Content-Type', 'application/json')
      .set(hook.headers as Record<string, string>)
      .send(hook.rawBody.toString());
  };

  const decide = (verificationId: string, body: object) =>
    admin.post(`/admin/identity-verifications/${verificationId}/decision`, body);

  async function started() {
    const ready = await customerReadyForVerification(app);
    const res = await ready.client.post('/identity-verification');
    expect(res.status).toBe(201);
    return { ...ready, verificationId: res.body.id as string };
  }

  it('exige el perfil completo (email verificado y foto) para iniciar', async () => {
    const { client } = await signInCustomer(app, AccountStatus.PENDING_VERIFICATION);
    const res = await client.post('/identity-verification');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PROFILE_INCOMPLETE');
    const details = res.body.details as Array<{ field: string }>;
    expect(details.map((d) => d.field).sort()).toEqual(['avatar', 'email']);
  });

  it('inicia: queda PENDING, se replica en el usuario y es idempotente', async () => {
    const { client, id } = await customerReadyForVerification(app);
    const first = await client.post('/identity-verification');
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      status: 'PENDING',
      alreadyInProgress: false,
      manualReview: false,
      provider: 'FAKE',
    });
    expect(first.body.redirectUrl).toContain('fake-identity.local');
    expect(await userRow(id)).toEqual({
      status: 'PENDING_VERIFICATION',
      verificationStatus: 'PENDING',
    });

    const again = await client.post('/identity-verification');
    expect(again.body).toMatchObject({ alreadyInProgress: true, id: first.body.id });

    const me = await client.get('/identity-verification/me');
    expect(me.body.status).toBe('PENDING');
    for (const internal of ['adminNote', 'decidedBy', 'userId', 'providerReference']) {
      expect(me.body).not.toHaveProperty(internal);
    }
  });

  it('dos inicios simultáneos crean un solo intento', async () => {
    const { client, id } = await customerReadyForVerification(app);
    const [a, b] = await Promise.all([
      client.post('/identity-verification'),
      client.post('/identity-verification'),
    ]);
    expect(a.body.id).toBe(b.body.id);
    expect(await dataSource.getRepository(IdentityVerification).countBy({ userId: id })).toBe(1);
  });

  it('webhook: firma inválida 401 sin cambios; válida aprueba y activa la cuenta', async () => {
    const { id, verificationId, client } = await started();
    const reference = await referenceOf(verificationId);
    fake.simulateDecision(reference, 'APPROVED');

    const forged = await request(app.getHttpServer())
      .post('/api/v1/webhooks/identity')
      .set('Content-Type', 'application/json')
      .set('x-fake-identity-signature', '00'.repeat(32))
      .send(JSON.stringify({ eventId: randomUUID(), providerReference: reference }));
    expect(forged.status).toBe(401);
    expect((await userRow(id)).verificationStatus).toBe('PENDING');

    const res = await sendWebhook(reference);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, outcome: 'PROCESSED' });
    expect(await userRow(id)).toEqual({ status: 'ACTIVE', verificationStatus: 'APPROVED' });
    // La cuenta activa ya puede operar con la misma sesión (el estado sale de la base).
    expect((await client.get('/auth/me')).body.status).toBe('ACTIVE');
  });

  it('un webhook duplicado se procesa una sola vez', async () => {
    const { id, verificationId } = await started();
    const reference = await referenceOf(verificationId);
    fake.simulateDecision(reference, 'REJECTED', 'DOCUMENT_MISMATCH');
    const eventId = `dup-${randomUUID()}`;

    expect((await sendWebhook(reference, eventId)).body.outcome).toBe('PROCESSED');
    expect((await sendWebhook(reference, eventId)).body.outcome).toBe('DUPLICATE');
    expect(await dataSource.getRepository(IdentityProviderEvent).countBy({ eventId })).toBe(1);
    expect(await service.getMine(id)).toMatchObject({
      status: 'REJECTED',
      reasonCode: 'DOCUMENT_MISMATCH',
    });
  });

  it('el cuerpo del webhook no decide: si el proveedor dice PENDING no cambia nada', async () => {
    const { id, verificationId } = await started();
    const res = await sendWebhook(await referenceOf(verificationId));
    expect(res.body.outcome).toBe('IGNORED');
    expect((await userRow(id)).verificationStatus).toBe('PENDING');
    expect((await sendWebhook(`fake_${randomUUID()}`)).body.outcome).toBe('UNKNOWN_REFERENCE');
  });

  it('REQUIRES_REVIEW lo resuelve el admin con motivo y auditoría; un webhook tardío no lo pisa', async () => {
    const { id, verificationId } = await started();
    const reference = await referenceOf(verificationId);
    fake.simulateDecision(reference, 'REQUIRES_REVIEW');
    await sendWebhook(reference);
    expect((await userRow(id)).verificationStatus).toBe('REQUIRES_REVIEW');

    const res = await decide(verificationId, {
      decision: 'APPROVE',
      reason: 'DNI y rostro coinciden por videollamada',
      adminNote: 'Videollamada del 02/11',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'APPROVED', decisionSource: 'ADMIN' });
    expect(await userRow(id)).toEqual({ status: 'ACTIVE', verificationStatus: 'APPROVED' });
    const audit = await dataSource
      .getRepository(AdminAuditLog)
      .findOneByOrFail({ targetId: verificationId, action: 'IDENTITY_VERIFICATION_APPROVE' });
    expect(audit).toMatchObject({ result: 'SUCCESS', reason: expect.stringContaining('DNI') });

    fake.simulateDecision(reference, 'REJECTED');
    expect((await sendWebhook(reference)).body.outcome).toBe('IGNORED');
    expect((await userRow(id)).verificationStatus).toBe('APPROVED');
  });

  it('revocar vuelve la cuenta a PENDING_VERIFICATION y cierra sus sesiones; transición inválida 409 auditada', async () => {
    const { id, verificationId, client } = await started();
    expect(
      (await decide(verificationId, { decision: 'APPROVE', reason: 'Identidad ok' })).status,
    ).toBe(200);
    expect(
      (await decide(verificationId, { decision: 'REVOKE', reason: 'Documento adulterado' })).status,
    ).toBe(200);
    expect(await userRow(id)).toEqual({
      status: 'PENDING_VERIFICATION',
      verificationStatus: 'REVOKED',
    });
    expect((await client.get('/auth/me')).status).toBe(401);

    const invalid = await decide(verificationId, {
      decision: 'APPROVE',
      reason: 'Intento inválido',
    });
    expect(invalid.status).toBe(409);
    expect(invalid.body.code).toBe('INVALID_STATE_TRANSITION');
    expect(
      await dataSource
        .getRepository(AdminAuditLog)
        .countBy({ targetId: verificationId, result: AuditResult.DENIED }),
    ).toBe(1);
  });

  it('el admin no puede aprobar sin la foto de perfil', async () => {
    const { id, verificationId } = await started();
    await dataSource.getRepository(User).update(id, { avatarFileId: null });
    const res = await decide(verificationId, { decision: 'APPROVE', reason: 'Identidad ok' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PROFILE_INCOMPLETE');
    expect((await userRow(id)).verificationStatus).toBe('PENDING');
  });

  it('una cuenta suspendida no se reactiva al aprobar', async () => {
    const { id, verificationId } = await started();
    await dataSource.getRepository(User).update(id, { status: AccountStatus.SUSPENDED });
    await decide(verificationId, { decision: 'APPROVE', reason: 'Identidad confirmada' });
    expect(await userRow(id)).toEqual({ status: 'SUSPENDED', verificationStatus: 'APPROVED' });
  });

  it('límite de intentos y no reintentar si ya está aprobada', async () => {
    const { client } = await customerReadyForVerification(app);
    for (let i = 0; i < 3; i++) {
      const res = await client.post('/identity-verification');
      expect(res.status).toBe(201);
      await decide(res.body.id as string, { decision: 'REJECT', reason: 'Foto ilegible' });
    }
    const exceeded = await client.post('/identity-verification');
    expect(exceeded.status).toBe(422);
    expect(exceeded.body.code).toBe('VERIFICATION_ATTEMPTS_EXCEEDED');

    const { client: approved, verificationId } = await started();
    await decide(verificationId, { decision: 'APPROVE', reason: 'Identidad confirmada' });
    const again = await approved.post('/identity-verification');
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_VERIFIED');
  });

  it('panel del admin: cola con los datos de la persona, filtros y validación', async () => {
    const { verificationId, email, avatar } = await started();
    const list = await admin.get('/admin/identity-verifications?status=PENDING&limit=50');
    expect(list.status).toBe(200);
    expect(list.body.meta.limit).toBe(50);
    const item = (list.body.data as Array<{ id: string }>).find((v) => v.id === verificationId);
    expect(item).toMatchObject({
      status: 'PENDING',
      subject: { email, role: 'CUSTOMER', avatarUrl: avatar.url },
    });

    expect((await admin.get('/admin/identity-verifications?limit=500')).status).toBe(400);
    expect((await decide(verificationId, { decision: 'APPROVE' })).status).toBe(400);
    expect(
      (await decide(verificationId, { decision: 'APPROVE', reason: 'Identidad ok', role: 'ADMIN' }))
        .status,
    ).toBe(400);
    expect(
      (await decide(randomUUID(), { decision: 'APPROVE', reason: 'Identidad ok' })).status,
    ).toBe(404);
  });

  describe('cambio de foto con la identidad aprobada (ADR 0019)', () => {
    async function approvedCustomer() {
      const ready = await started();
      await decide(ready.verificationId, { decision: 'APPROVE', reason: 'Identidad confirmada' });
      return ready;
    }

    const fileStatus = async (id: string) =>
      (await dataSource.getRepository(StoredFile).findOneByOrFail({ id })).status;

    /** Sube una foto nueva y la propone; devuelve la respuesta del cambio. */
    async function changePhoto(client: Client) {
      const fileId = await uploadFile(client, PNG_BYTES, { purpose: 'AVATAR', kind: 'IMAGE' });
      const res = await client.put('/users/me/avatar', { fileId });
      expect(res.status).toBe(200);
      return res.body as { id: string; url: string; underReview: boolean };
    }

    const openReview = (userId: string) =>
      dataSource.getRepository(IdentityVerification).findOneByOrFail({
        userId,
        kind: VerificationKind.PROFILE_CHANGE,
        status: VerificationStatus.REQUIRES_REVIEW,
      });

    it('la foto nueva queda en revisión, la cuenta sigue activa y se ve la anterior', async () => {
      const { client, id, avatar } = await approvedCustomer();
      const proposed = await changePhoto(client);
      expect(proposed.underReview).toBe(true);

      const me = (await client.get('/auth/me')).body;
      expect(me).toMatchObject({
        status: 'ACTIVE',
        verificationStatus: 'REQUIRES_REVIEW',
        avatarUrl: avatar.url,
        pendingAvatarUrl: proposed.url,
      });
      const start = await client.post('/identity-verification');
      expect(start.body.code).toBe('ALREADY_VERIFIED');

      // Otra foto mientras tanto reemplaza a la pendiente, en la misma revisión.
      const again = await changePhoto(client);
      expect(await fileStatus(proposed.id)).toBe(FileStatus.DELETED);
      expect(
        await dataSource
          .getRepository(IdentityVerification)
          .countBy({ userId: id, kind: VerificationKind.PROFILE_CHANGE }),
      ).toBe(1);

      const list = await admin.get('/admin/identity-verifications?status=REQUIRES_REVIEW&limit=50');
      const review = await openReview(id);
      expect(
        (list.body.data as Array<{ id: string }>).find((v) => v.id === review.id),
      ).toMatchObject({
        kind: 'PROFILE_CHANGE',
        subject: { avatarUrl: avatar.url, pendingAvatarUrl: again.url },
      });
    });

    it('si el admin la aprueba, reemplaza a la anterior', async () => {
      const { client, id, avatar } = await approvedCustomer();
      const proposed = await changePhoto(client);
      const review = await openReview(id);

      const res = await decide(review.id, { decision: 'APPROVE', reason: 'Es la misma persona' });
      expect(res.status).toBe(200);
      expect((await client.get('/auth/me')).body).toMatchObject({
        status: 'ACTIVE',
        verificationStatus: 'APPROVED',
        avatarUrl: proposed.url,
        pendingAvatarUrl: null,
      });
      expect(await fileStatus(avatar.id)).toBe(FileStatus.DELETED);
    });

    it('si el admin la rechaza, queda la anterior y la identidad sigue aprobada', async () => {
      const { client, id, avatar } = await approvedCustomer();
      const proposed = await changePhoto(client);
      const review = await openReview(id);

      const res = await decide(review.id, { decision: 'REJECT', reason: 'No es la misma persona' });
      expect(res.status).toBe(200);
      expect((await client.get('/auth/me')).body).toMatchObject({
        status: 'ACTIVE',
        verificationStatus: 'APPROVED',
        avatarUrl: avatar.url,
        pendingAvatarUrl: null,
      });
      expect(await fileStatus(proposed.id)).toBe(FileStatus.DELETED);
    });

    it('revocar la identidad descarta la foto pendiente y cierra la revisión', async () => {
      const { client, id, verificationId } = await approvedCustomer();
      const proposed = await changePhoto(client);
      const res = await decide(verificationId, {
        decision: 'REVOKE',
        reason: 'Documento adulterado',
      });
      expect(res.status).toBe(200);
      const user = await dataSource.getRepository(User).findOneByOrFail({ id });
      expect(user).toMatchObject({
        status: AccountStatus.PENDING_VERIFICATION,
        verificationStatus: VerificationStatus.REVOKED,
        pendingAvatarFileId: null,
      });
      expect(await fileStatus(proposed.id)).toBe(FileStatus.DELETED);
      expect(
        await dataSource.getRepository(IdentityVerification).countBy({
          userId: id,
          kind: VerificationKind.PROFILE_CHANGE,
          status: VerificationStatus.REQUIRES_REVIEW,
        }),
      ).toBe(0);
    });

    it('antes de la primera aprobación la foto se cambia directamente', async () => {
      const { client, avatar } = await customerReadyForVerification(app);
      const proposed = await changePhoto(client);
      expect(proposed.underReview).toBe(false);
      expect((await client.get('/auth/me')).body.avatarUrl).toBe(proposed.url);
      expect(await fileStatus(avatar.id)).toBe(FileStatus.DELETED);
    });
  });
});

import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource, IsNull } from 'typeorm';
import { AdminAuditLog } from '../src/audit/entities/admin-audit-log.entity';
import { purgeExpiredAuthData } from '../src/auth/auth-cleanup.job';
import { AuthSession } from '../src/auth/entities/auth-session.entity';
import { MAX_DEVICES } from '../src/auth/services/sessions.service';
import { ErrorCounters } from '../src/monitoring/error-counters';
import { ALERT_THRESHOLDS, SecurityAlertsService } from '../src/monitoring/security-alerts.service';
import { Notification, NotificationType } from '../src/notifications/entities/notification.entity';
import { StoredFile } from '../src/uploads/entities/stored-file.entity';
import { FileStatus } from '../src/uploads/file.enums';
import { UploadsService } from '../src/uploads/uploads.service';
import { Client, mailbox, PASSWORD, signInAdmin, signInCustomer } from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';
import { PNG_BYTES, uploadFile } from './utils/uploads';

const DAY = 24 * 60 * 60 * 1000;

/** Etapa 12: auditoría de logins, límite de dispositivos, limpiezas y alertas de seguridad. */
describe('Endurecimiento (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('audita los logins fallidos y exitosos con la IP seudonimizada, sin el email', async () => {
    const { email, id } = await signInCustomer(app);
    const client = new Client(app);
    await client.post('/auth/login', { email, password: 'incorrecta-123' });
    await client.post('/auth/login', { email: 'nadie@example.com', password: 'x' });
    await client.login(email);

    const logs = await dataSource.getRepository(AdminAuditLog).find({
      where: [
        { action: 'LOGIN_FAILED', targetId: id },
        { action: 'LOGIN_SUCCEEDED', targetId: id },
      ],
      order: { createdAt: 'ASC' },
    });
    expect(logs.map((l) => [l.action, l.metadata])).toEqual(
      expect.arrayContaining([
        ['LOGIN_FAILED', { method: 'PASSWORD', cause: 'BAD_PASSWORD' }],
        ['LOGIN_SUCCEEDED', { method: 'PASSWORD' }],
      ]),
    );
    expect(logs.every((l) => /^[0-9a-f]{64}$/.test(l.ipHash ?? ''))).toBe(true);
    const unknown = await dataSource.getRepository(AdminAuditLog).find({
      where: { action: 'LOGIN_FAILED', targetId: IsNull() },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    expect(JSON.stringify(unknown)).not.toContain('nadie@example.com');
  });

  it(`con más de ${MAX_DEVICES} dispositivos cierra el que hace más tiempo no se usa`, async () => {
    const { email, id, client: first } = await signInCustomer(app);
    for (let i = 0; i < MAX_DEVICES; i++) await new Client(app).login(email, PASSWORD);
    const active = await dataSource
      .getRepository(AuthSession)
      .createQueryBuilder('s')
      .where('s.userId = :id AND s.revokedAt IS NULL AND s.expiresAt > now()', { id })
      .getCount();
    expect(active).toBe(MAX_DEVICES);
    expect((await first.get('/auth/me')).status).toBe(401);
  });

  it('limpia sesiones de dispositivos vencidos, enlaces usados y pedidos de Google viejos', async () => {
    const { id } = await signInCustomer(app);
    const old = new Date(Date.now() - 40 * DAY);
    await dataSource.query(
      `INSERT INTO auth_sessions (user_id, family_id, refresh_token_hash, expires_at,
                                  family_expires_at, revoked_at, revoke_reason)
       VALUES ($1, gen_random_uuid(), md5(random()::text) || md5(random()::text), $2, $2, $2, 'LOGOUT')`,
      [id, old],
    );
    await dataSource.query(
      `INSERT INTO one_time_tokens (user_id, type, token_hash, expires_at, used_at)
       VALUES ($1, 'EMAIL_VERIFY', md5(random()::text) || md5(random()::text), $2, $2)`,
      [id, old],
    );
    const result = await purgeExpiredAuthData(dataSource);
    expect(result.sessions).toBeGreaterThanOrEqual(1);
    expect(result.oneTimeTokens).toBeGreaterThanOrEqual(1);
    // Las vigentes siguen.
    expect(
      await dataSource
        .getRepository(AuthSession)
        .createQueryBuilder('s')
        .where('s.userId = :id AND s.revokedAt IS NULL', { id })
        .getCount(),
    ).toBe(1);
  });

  it('reintenta los borrados del almacenamiento que quedaron pendientes', async () => {
    const { client } = await signInCustomer(app);
    const fileId = await uploadFile(client, PNG_BYTES, { purpose: 'EVIDENCE', kind: 'IMAGE' });
    // Simula un borrado que falló hace dos horas.
    await dataSource.query(
      `UPDATE stored_files SET status = 'DELETED', storage_deleted_at = NULL,
              updated_at = now() - interval '2 hours' WHERE id = $1`,
      [fileId],
    );
    expect(await app.get(UploadsService).retryPendingDeletions()).toBeGreaterThanOrEqual(1);
    const file = await dataSource.getRepository(StoredFile).findOneByOrFail({ id: fileId });
    expect(file.status).toBe(FileStatus.DELETED);
    expect(file.storageDeletedAt).not.toBeNull();
  });

  it('alerta de seguridad por picos: notificación y email al admin, sin repetirla enseguida', async () => {
    const { admin } = await signInAdmin(app);
    const adminRow = await dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM users WHERE email = $1`,
      [admin.email],
    );
    await dataSource.getRepository(AdminAuditLog).insert(
      Array.from({ length: ALERT_THRESHOLDS.failedLogins }, () => ({
        actorId: null,
        action: 'LOGIN_FAILED',
        targetType: 'USER',
        targetId: null,
        reason: null,
        result: 'DENIED' as never,
        metadata: { method: 'PASSWORD', cause: 'UNKNOWN_EMAIL' },
        ipHash: null,
      })),
    );
    const counters = app.get(ErrorCounters);
    for (let i = 0; i < ALERT_THRESHOLDS.serverErrors; i++) counters.record(500);

    const alerts = app.get(SecurityAlertsService);
    const sent = await alerts.check();
    expect(sent).toEqual(expect.arrayContaining(['failedLogins', 'serverErrors']));
    expect(
      await dataSource
        .getRepository(Notification)
        .countBy({ userId: adminRow[0].id, type: NotificationType.SECURITY_ALERT }),
    ).toBeGreaterThanOrEqual(2);
    expect(mailbox(app).lastTo(admin.email)?.subject).toBe('Nexo PRO: alerta de seguridad');
    // Dentro de la hora no se repite.
    expect(await alerts.check()).not.toContain('failedLogins');
  });
});

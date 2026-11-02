import { randomUUID } from 'crypto';
import { DataSource, QueryFailedError } from 'typeorm';
import { AuditService } from '../../src/audit/audit.service';
import { AdminAuditLog } from '../../src/audit/entities/admin-audit-log.entity';
import { createTestDataSource } from '../setup/test-database';

const sqlStateOf = (error: unknown) =>
  error instanceof QueryFailedError ? (error.driverError as { code?: string }).code : undefined;

describe('Auditoría append-only (integración)', () => {
  let dataSource: DataSource;
  let audit: AuditService;

  beforeAll(async () => {
    dataSource = await createTestDataSource().initialize();
    audit = new AuditService(dataSource.getRepository(AdminAuditLog));
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('registra la acción y descarta metadata sensible', async () => {
    const targetId = randomUUID();
    await audit.record({
      actorId: null,
      action: 'TEST_ACTION',
      targetType: 'TEST',
      targetId,
      reason: 'prueba',
      result: 'SUCCESS',
      metadata: { status: 'OK', password: 'no-debe-guardarse' },
    });
    const saved = await dataSource.getRepository(AdminAuditLog).findOneByOrFail({ targetId });
    expect(saved).toMatchObject({ action: 'TEST_ACTION', result: 'SUCCESS', reason: 'prueba' });
    expect(saved.metadata).toEqual({ status: 'OK' });
    expect(saved.createdAt).toBeInstanceOf(Date);
  });

  it.each([
    ['UPDATE', `UPDATE admin_audit_logs SET reason = 'alterado'`],
    ['DELETE', `DELETE FROM admin_audit_logs`],
    ['TRUNCATE', `TRUNCATE admin_audit_logs`],
  ])('la base rechaza %s sobre la auditoría', async (_operation, sql) => {
    const error: unknown = await dataSource.query(sql).catch((e: unknown) => e);
    expect(sqlStateOf(error)).toBe('42501');
  });

  it('escribe dentro de la transacción del llamador (si se revierte, no queda registro)', async () => {
    const targetId = randomUUID();
    await dataSource
      .transaction(async (manager) => {
        await audit.record(
          {
            actorId: null,
            action: 'TEST_ROLLBACK',
            targetType: 'TEST',
            targetId,
            reason: null,
            result: 'FAILED',
          },
          manager,
        );
        throw new Error('rollback');
      })
      .catch(() => undefined);
    await expect(dataSource.getRepository(AdminAuditLog).countBy({ targetId })).resolves.toBe(0);
  });
});

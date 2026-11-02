import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Período de gracia de la baja (ADR 0016): la cuenta queda DEACTIVATED y se anonimiza recién en
 * `deletion_scheduled_for`. Mientras tanto el admin puede restaurarla.
 */
export class AccountDeletionGracePeriod1793640010000 implements MigrationInterface {
  name = 'AccountDeletionGracePeriod1793640010000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE users ADD COLUMN deletion_scheduled_for timestamptz`);
    // Solo las cuentas en gracia: lo usa el proceso que anonimiza las vencidas.
    await q.query(`
      CREATE INDEX ix_users_deletion_scheduled_for ON users (deletion_scheduled_for)
        WHERE deletion_scheduled_for IS NOT NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX ix_users_deletion_scheduled_for`);
    await q.query(`ALTER TABLE users DROP COLUMN deletion_scheduled_for`);
  }
}

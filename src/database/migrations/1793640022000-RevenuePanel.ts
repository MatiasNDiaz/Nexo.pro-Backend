import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Etapa 13.1 (ADR 0030): panel de ingresos. Cada pago guarda su tipo al aplicarse y la fecha en que
 * se devolvió la plata (reembolso o contracargo), para sumar y restar por fecha con criterio de caja.
 * Los pagos que ya existían se completan con la misma regla que usa el código.
 */
export class RevenuePanel1793640022000 implements MigrationInterface {
  name = 'RevenuePanel1793640022000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE payment_kind AS ENUM ('NEW', 'RENEWAL', 'REACTIVATION', 'UPGRADE')`);
    await q.query(`ALTER TABLE payments ADD COLUMN kind payment_kind`);
    await q.query(`ALTER TABLE payments ADD COLUMN money_returned_at timestamptz`);

    // Tipo: diferencia = mejora; con un período pago vigente al aplicarse = renovación; con algún
    // pago anterior que seguía en pie = reactivación; si no, nuevo.
    await q.query(`
      UPDATE payments p SET kind = (CASE
        WHEN p.purpose = 'UPGRADE_DIFFERENCE' THEN 'UPGRADE'
        WHEN EXISTS (
          SELECT 1 FROM payments o
           WHERE o.user_id = p.user_id AND o.id <> p.id AND o.applied_at < p.applied_at
             AND (o.reverted_at IS NULL OR o.reverted_at > p.applied_at)
             AND o.granted_until > p.applied_at) THEN 'RENEWAL'
        WHEN EXISTS (
          SELECT 1 FROM payments o
           WHERE o.user_id = p.user_id AND o.id <> p.id AND o.applied_at < p.applied_at
             AND (o.reverted_at IS NULL OR o.reverted_at > p.applied_at)) THEN 'REACTIVATION'
        ELSE 'NEW' END)::payment_kind
       WHERE p.applied_at IS NOT NULL`);
    await q.query(`
      UPDATE payments SET money_returned_at = COALESCE(reverted_at, updated_at)
       WHERE status IN ('REFUNDED', 'CHARGED_BACK')`);

    await q.query(`
      ALTER TABLE payments ADD CONSTRAINT ck_payments_kind
        CHECK (kind IS NULL OR applied_at IS NOT NULL)`);
    await q.query(`
      ALTER TABLE payments ADD CONSTRAINT ck_payments_money_returned
        CHECK ((money_returned_at IS NOT NULL) = (status IN ('REFUNDED', 'CHARGED_BACK')))`);
    await q.query(`
      CREATE INDEX ix_payments_approved_at ON payments (approved_at)
        WHERE approved_at IS NOT NULL`);
    await q.query(`
      CREATE INDEX ix_payments_money_returned_at ON payments (money_returned_at)
        WHERE money_returned_at IS NOT NULL`);
    await q.query(`CREATE INDEX ix_users_created_at ON users (created_at)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX ix_users_created_at`);
    await q.query(`DROP INDEX ix_payments_money_returned_at`);
    await q.query(`DROP INDEX ix_payments_approved_at`);
    await q.query(`ALTER TABLE payments DROP CONSTRAINT ck_payments_money_returned`);
    await q.query(`ALTER TABLE payments DROP CONSTRAINT ck_payments_kind`);
    await q.query(`ALTER TABLE payments DROP COLUMN money_returned_at`);
    await q.query(`ALTER TABLE payments DROP COLUMN kind`);
    await q.query(`DROP TYPE payment_kind`);
  }
}

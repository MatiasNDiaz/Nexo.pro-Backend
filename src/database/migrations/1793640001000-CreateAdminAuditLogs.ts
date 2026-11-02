import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Auditoría append-only (plan §8.2.6). Dos capas:
 * 1. Trigger que rechaza UPDATE, DELETE y TRUNCATE para cualquier rol (funciona aunque el
 *    proveedor no permita crear roles separados).
 * 2. Se revocan UPDATE/DELETE/TRUNCATE a todo rol distinto del dueño que los haya recibido por
 *    privilegios por defecto (p. ej. el rol de runtime `nexo_app` del entorno local).
 */
export class CreateAdminAuditLogs1793640001000 implements MigrationInterface {
  name = 'CreateAdminAuditLogs1793640001000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE audit_result AS ENUM ('SUCCESS', 'DENIED', 'FAILED')`);
    await q.query(`
      CREATE TABLE admin_audit_logs (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        actor_id uuid,
        action varchar(100) NOT NULL,
        target_type varchar(60) NOT NULL,
        target_id uuid,
        reason text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        result audit_result NOT NULL,
        ip_hash varchar(64),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_admin_audit_logs PRIMARY KEY (id)
      )`);
    await q.query(
      `CREATE INDEX ix_admin_audit_logs_actor_id_created_at ON admin_audit_logs (actor_id, created_at)`,
    );
    await q.query(
      `CREATE INDEX ix_admin_audit_logs_target_type_target_id ON admin_audit_logs (target_type, target_id)`,
    );
    await q.query(
      `CREATE INDEX ix_admin_audit_logs_action_created_at ON admin_audit_logs (action, created_at)`,
    );

    await q.query(`
      CREATE FUNCTION prevent_audit_log_changes() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'admin_audit_logs es append-only: % no permitido', TG_OP
          USING ERRCODE = 'insufficient_privilege';
      END
      $$`);
    await q.query(`
      CREATE TRIGGER trg_admin_audit_logs_append_only
        BEFORE UPDATE OR DELETE ON admin_audit_logs
        FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_changes()`);
    await q.query(`
      CREATE TRIGGER trg_admin_audit_logs_no_truncate
        BEFORE TRUNCATE ON admin_audit_logs
        FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_log_changes()`);

    await q.query(`
      DO $$
      DECLARE grantee_role text;
      BEGIN
        FOR grantee_role IN
          SELECT DISTINCT grantee FROM information_schema.role_table_grants
          WHERE table_schema = current_schema() AND table_name = 'admin_audit_logs'
            AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE') AND grantee <> current_user
        LOOP
          EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON admin_audit_logs FROM %I', grantee_role);
        END LOOP;
      END
      $$`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE admin_audit_logs`);
    await q.query(`DROP FUNCTION prevent_audit_log_changes()`);
    await q.query(`DROP TYPE audit_result`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/** Usuarios (plan §8.2.1, ADR 0006 y 0010). Sin DNI. Agrega la FK pendiente de la auditoría. */
export class CreateUsers1793640005000 implements MigrationInterface {
  name = 'CreateUsers1793640005000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE user_role AS ENUM ('CUSTOMER', 'PROFESSIONAL', 'ADMIN')`);
    await q.query(`CREATE TYPE account_status AS ENUM
      ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'BANNED', 'DEACTIVATED')`);
    await q.query(`CREATE TYPE verification_status AS ENUM
      ('NOT_STARTED', 'PENDING', 'REQUIRES_REVIEW', 'APPROVED', 'REJECTED', 'REVOKED')`);
    await q.query(`
      CREATE TABLE users (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        email citext NOT NULL,
        password_hash text NOT NULL,
        role user_role NOT NULL,
        status account_status NOT NULL DEFAULT 'PENDING_VERIFICATION',
        verification_status verification_status NOT NULL DEFAULT 'NOT_STARTED',
        first_name varchar(60) NOT NULL,
        last_name varchar(60) NOT NULL,
        phone varchar(20) NOT NULL,
        neighborhood_id uuid,
        email_verified_at timestamptz,
        failed_login_attempts integer NOT NULL DEFAULT 0,
        locked_until timestamptz,
        password_changed_at timestamptz,
        last_login_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT pk_users PRIMARY KEY (id),
        CONSTRAINT fk_users_neighborhood_id FOREIGN KEY (neighborhood_id)
          REFERENCES neighborhoods (id) ON DELETE RESTRICT,
        CONSTRAINT ck_users_failed_login_attempts CHECK (failed_login_attempts >= 0),
        CONSTRAINT ck_users_customer_neighborhood
          CHECK (role <> 'CUSTOMER' OR neighborhood_id IS NOT NULL)
      )`);
    // Email único entre cuentas no borradas (citext: sin distinguir mayúsculas).
    await q.query(`CREATE UNIQUE INDEX uq_users_email ON users (email) WHERE deleted_at IS NULL`);
    await q.query(`CREATE INDEX ix_users_neighborhood_id ON users (neighborhood_id)`);

    await q.query(`
      ALTER TABLE admin_audit_logs
        ADD CONSTRAINT fk_admin_audit_logs_actor_id FOREIGN KEY (actor_id)
        REFERENCES users (id) ON DELETE RESTRICT`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE admin_audit_logs DROP CONSTRAINT fk_admin_audit_logs_actor_id`);
    await q.query(`DROP TABLE users`);
    await q.query(`DROP TYPE verification_status`);
    await q.query(`DROP TYPE account_status`);
    await q.query(`DROP TYPE user_role`);
  }
}

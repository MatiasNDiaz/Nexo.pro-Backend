import { MigrationInterface, QueryRunner } from 'typeorm';

/** Sesiones (refresh rotativo), enlaces de un solo uso y segundo factor (plan §8.2.1 y §9.4). */
export class CreateAuthTables1793640007000 implements MigrationInterface {
  name = 'CreateAuthTables1793640007000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE session_revoke_reason AS ENUM (
      'LOGOUT', 'LOGOUT_ALL', 'SESSION_CLOSED', 'ROTATED', 'REUSE_DETECTED', 'PASSWORD_CHANGED',
      'PASSWORD_RESET', 'ROLE_CHANGED', 'ACCOUNT_SUSPENDED', 'ACCOUNT_DELETED',
      'VERIFICATION_REVOKED', 'ADMIN_REVOKED')`);
    await q.query(`
      CREATE TABLE auth_sessions (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        family_id uuid NOT NULL,
        refresh_token_hash char(64) NOT NULL,
        replaced_by_id uuid,
        expires_at timestamptz NOT NULL,
        family_expires_at timestamptz NOT NULL,
        last_used_at timestamptz,
        revoked_at timestamptz,
        revoke_reason session_revoke_reason,
        user_agent varchar(255),
        ip_hash varchar(64),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_auth_sessions PRIMARY KEY (id),
        CONSTRAINT uq_auth_sessions_refresh_token_hash UNIQUE (refresh_token_hash),
        CONSTRAINT fk_auth_sessions_user_id FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT fk_auth_sessions_replaced_by_id FOREIGN KEY (replaced_by_id)
          REFERENCES auth_sessions (id) ON DELETE SET NULL
      )`);
    await q.query(`CREATE INDEX ix_auth_sessions_user_id ON auth_sessions (user_id)`);
    await q.query(`CREATE INDEX ix_auth_sessions_family_id ON auth_sessions (family_id)`);
    await q.query(`CREATE INDEX ix_auth_sessions_replaced_by_id ON auth_sessions (replaced_by_id)`);

    await q.query(`CREATE TYPE one_time_token_type AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET')`);
    await q.query(`
      CREATE TABLE one_time_tokens (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        type one_time_token_type NOT NULL,
        token_hash char(64) NOT NULL,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_one_time_tokens PRIMARY KEY (id),
        CONSTRAINT uq_one_time_tokens_token_hash UNIQUE (token_hash),
        CONSTRAINT fk_one_time_tokens_user_id FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE CASCADE
      )`);
    await q.query(
      `CREATE INDEX ix_one_time_tokens_user_id_type ON one_time_tokens (user_id, type)`,
    );

    await q.query(`
      CREATE TABLE user_mfa_settings (
        user_id uuid NOT NULL,
        totp_secret_encrypted text NOT NULL,
        recovery_code_hashes jsonb NOT NULL DEFAULT '[]'::jsonb,
        last_used_step bigint,
        enabled_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_user_mfa_settings PRIMARY KEY (user_id),
        CONSTRAINT fk_user_mfa_settings_user_id FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE CASCADE
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE user_mfa_settings`);
    await q.query(`DROP TABLE one_time_tokens`);
    await q.query(`DROP TYPE one_time_token_type`);
    await q.query(`DROP TABLE auth_sessions`);
    await q.query(`DROP TYPE session_revoke_reason`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Login con Google (ADR 0015 y 0023): identidades vinculadas, vinculaciones y registros a medio
 * terminar, y contraseña opcional para las cuentas creadas con Google (nunca para el admin).
 */
export class GoogleLogin1793640016000 implements MigrationInterface {
  name = 'GoogleLogin1793640016000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`);
    await q.query(`
      ALTER TABLE users ADD CONSTRAINT ck_users_admin_password
        CHECK (role <> 'ADMIN' OR password_hash IS NOT NULL)`);

    await q.query(`
      CREATE TABLE auth_identities (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        provider varchar(20) NOT NULL,
        provider_subject varchar(255) NOT NULL,
        email_at_link citext NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_used_at timestamptz,
        CONSTRAINT pk_auth_identities PRIMARY KEY (id),
        CONSTRAINT uq_auth_identities_provider_provider_subject UNIQUE (provider, provider_subject),
        CONSTRAINT uq_auth_identities_user_id_provider UNIQUE (user_id, provider),
        CONSTRAINT fk_auth_identities_user_id FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT ck_auth_identities_provider CHECK (provider IN ('GOOGLE'))
      )`);

    await q.query(`CREATE TYPE oauth_request_kind AS ENUM ('LINK', 'SIGNUP')`);
    await q.query(`
      CREATE TABLE oauth_pending_requests (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        kind oauth_request_kind NOT NULL,
        provider varchar(20) NOT NULL,
        provider_subject varchar(255) NOT NULL,
        email citext NOT NULL,
        first_name varchar(60),
        last_name varchar(60),
        user_id uuid,
        token_hash char(64) NOT NULL,
        email_token_hash char(64),
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_oauth_pending_requests PRIMARY KEY (id),
        CONSTRAINT uq_oauth_pending_requests_token_hash UNIQUE (token_hash),
        CONSTRAINT uq_oauth_pending_requests_email_token_hash UNIQUE (email_token_hash),
        CONSTRAINT fk_oauth_pending_requests_user_id FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT ck_oauth_pending_requests_link_user CHECK ((kind = 'LINK') = (user_id IS NOT NULL)),
        CONSTRAINT ck_oauth_pending_requests_provider CHECK (provider IN ('GOOGLE'))
      )`);
    await q.query(
      `CREATE INDEX ix_oauth_pending_requests_user_id ON oauth_pending_requests (user_id)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE oauth_pending_requests`);
    await q.query(`DROP TYPE oauth_request_kind`);
    await q.query(`DROP TABLE auth_identities`);
    await q.query(`ALTER TABLE users DROP CONSTRAINT ck_users_admin_password`);
    // Las cuentas solo Google no tienen contraseña: quedan con un hash imposible de satisfacer.
    await q.query(`UPDATE users SET password_hash = '!' WHERE password_hash IS NULL`);
    await q.query(`ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL`);
  }
}

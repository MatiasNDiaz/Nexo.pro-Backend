import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Depende de la migración de `users` (fase de auth), que debe crear users.verification_status
 * con el mismo enum `verification_status`. Si esa migración ya creó el enum, quitar el CREATE TYPE de abajo.
 */
export class CreateIdentityVerification1730559600000 implements MigrationInterface {
  name = 'CreateIdentityVerification1730559600000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN
      CREATE TYPE verification_status AS ENUM ('NOT_STARTED','PENDING','REQUIRES_REVIEW','APPROVED','REJECTED','REVOKED');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
    await q.query(`CREATE TYPE verification_decision_source AS ENUM ('PROVIDER','ADMIN')`);
    await q.query(`
      CREATE TABLE identity_verifications (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        status verification_status NOT NULL,
        provider varchar(40) NOT NULL,
        provider_reference varchar(200),
        attempt_number smallint NOT NULL CHECK (attempt_number > 0),
        decision_source verification_decision_source,
        reason_code varchar(100),
        admin_note varchar(500),
        decided_by uuid REFERENCES users(id) ON DELETE RESTRICT,
        submitted_at timestamptz NOT NULL,
        decided_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_identity_verifications_status_not_started CHECK (status <> 'NOT_STARTED'),
        CONSTRAINT uq_identity_verifications_user_attempt UNIQUE (user_id, attempt_number)
      )`);
    await q.query(`CREATE INDEX ix_identity_verifications_user ON identity_verifications (user_id)`);
    await q.query(`CREATE INDEX ix_identity_verifications_status_submitted ON identity_verifications (status, submitted_at)`);
    await q.query(`CREATE UNIQUE INDEX uq_identity_verifications_provider_ref
      ON identity_verifications (provider, provider_reference) WHERE provider_reference IS NOT NULL`);
    await q.query(`CREATE UNIQUE INDEX uq_identity_verifications_open_attempt
      ON identity_verifications (user_id) WHERE status IN ('PENDING','REQUIRES_REVIEW')`);
    await q.query(`
      CREATE TABLE identity_provider_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider varchar(40) NOT NULL,
        event_id varchar(200) NOT NULL,
        verification_id uuid REFERENCES identity_verifications(id) ON DELETE RESTRICT,
        received_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz,
        processing_error varchar(200),
        CONSTRAINT uq_identity_provider_events_event UNIQUE (provider, event_id)
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE identity_provider_events`);
    await q.query(`DROP TABLE identity_verifications`);
    await q.query(`DROP TYPE verification_decision_source`);
    // verification_status lo usa users: se elimina en la migración de users.
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Verificación de identidad (ADR 0003), adaptada del módulo de referencia
 * (`docs/referencia/verificacion-identidad`) a la convención de nombres del repo. El enum
 * `verification_status` ya existe (lo creó la migración de `users`). Sin imágenes de DNI ni selfies:
 * solo estado, proveedor, referencia, motivo y fechas.
 */
export class CreateIdentityVerification1793640012000 implements MigrationInterface {
  name = 'CreateIdentityVerification1793640012000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE verification_decision_source AS ENUM ('PROVIDER', 'ADMIN')`);
    await q.query(`
      CREATE TABLE identity_verifications (
        id uuid NOT NULL,
        user_id uuid NOT NULL,
        status verification_status NOT NULL,
        provider varchar(40) NOT NULL,
        provider_reference varchar(200),
        attempt_number smallint NOT NULL,
        decision_source verification_decision_source,
        reason_code varchar(100),
        admin_note varchar(500),
        decided_by uuid,
        submitted_at timestamptz NOT NULL,
        decided_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_identity_verifications PRIMARY KEY (id),
        CONSTRAINT uq_identity_verifications_user_id_attempt_number UNIQUE (user_id, attempt_number),
        CONSTRAINT fk_identity_verifications_user_id FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_identity_verifications_decided_by FOREIGN KEY (decided_by)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT ck_identity_verifications_status CHECK (status <> 'NOT_STARTED'),
        CONSTRAINT ck_identity_verifications_attempt_number CHECK (attempt_number > 0)
      )`);
    await q.query(
      `CREATE INDEX ix_identity_verifications_status_submitted_at ON identity_verifications (status, submitted_at)`,
    );
    await q.query(
      `CREATE INDEX ix_identity_verifications_decided_by ON identity_verifications (decided_by)`,
    );
    await q.query(`
      CREATE UNIQUE INDEX uq_identity_verifications_provider_reference
        ON identity_verifications (provider, provider_reference) WHERE provider_reference IS NOT NULL`);
    // Un solo intento abierto por usuario: dos clics simultáneos no crean dos.
    await q.query(`
      CREATE UNIQUE INDEX uq_identity_verifications_open_attempt
        ON identity_verifications (user_id) WHERE status IN ('PENDING', 'REQUIRES_REVIEW')`);

    await q.query(`
      CREATE TABLE identity_provider_events (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        provider varchar(40) NOT NULL,
        event_id varchar(200) NOT NULL,
        verification_id uuid,
        received_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz,
        processing_error varchar(200),
        CONSTRAINT pk_identity_provider_events PRIMARY KEY (id),
        CONSTRAINT uq_identity_provider_events_provider_event_id UNIQUE (provider, event_id),
        CONSTRAINT fk_identity_provider_events_verification_id FOREIGN KEY (verification_id)
          REFERENCES identity_verifications (id) ON DELETE RESTRICT
      )`);
    await q.query(
      `CREATE INDEX ix_identity_provider_events_verification_id ON identity_provider_events (verification_id)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE identity_provider_events`);
    await q.query(`DROP TABLE identity_verifications`);
    await q.query(`DROP TYPE verification_decision_source`);
  }
}

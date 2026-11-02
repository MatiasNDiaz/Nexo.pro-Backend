import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Etapa 7.2: perfil del cliente y del profesional, medios, certificados (ADR 0020), redes,
 * disponibilidad y revisión de la foto con identidad aprobada (ADR 0019).
 *
 * Los valores nuevos de `file_purpose` y `file_kind` se agregan con `ADD VALUE`; esta migración no
 * los usa (PostgreSQL no deja usarlos en la misma transacción en que se crean).
 */
export class ProfilesMediaAvailability1793640013000 implements MigrationInterface {
  name = 'ProfilesMediaAvailability1793640013000';

  public async up(q: QueryRunner): Promise<void> {
    // --- Archivos: medios del perfil y certificados (PDF incluido) ---
    await q.query(`ALTER TYPE file_purpose ADD VALUE 'PROFILE_MEDIA'`);
    await q.query(`ALTER TYPE file_purpose ADD VALUE 'CERTIFICATE'`);
    await q.query(`ALTER TYPE file_kind ADD VALUE 'DOCUMENT'`);

    // --- ADR 0019: foto en revisión y tipo de revisión ---
    await q.query(`
      ALTER TABLE users
        ADD COLUMN pending_avatar_file_id uuid,
        ADD CONSTRAINT fk_users_pending_avatar_file_id FOREIGN KEY (pending_avatar_file_id)
          REFERENCES stored_files (id) ON DELETE RESTRICT`);
    await q.query(`CREATE INDEX ix_users_pending_avatar_file_id ON users (pending_avatar_file_id)`);
    await q.query(`CREATE TYPE verification_kind AS ENUM ('IDENTITY', 'AVATAR_CHANGE')`);
    await q.query(
      `ALTER TABLE identity_verifications ADD COLUMN kind verification_kind NOT NULL DEFAULT 'IDENTITY'`,
    );

    // --- Perfil del cliente ---
    await q.query(`
      CREATE TABLE customer_profiles (
        user_id uuid NOT NULL,
        extra_info varchar(300),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_customer_profiles PRIMARY KEY (user_id),
        CONSTRAINT fk_customer_profiles_user_id FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE RESTRICT
      )`);

    // --- Perfil profesional ---
    await q.query(`CREATE TYPE rate_mode AS ENUM ('PER_VISIT', 'PER_HOUR', 'PER_JOB')`);
    await q.query(`CREATE TYPE attention_status AS ENUM ('AVAILABLE', 'WORKING', 'RESTING')`);
    await q.query(`
      ALTER TABLE professional_profiles
        ADD COLUMN slug varchar(80),
        ADD COLUMN business_name varchar(80),
        ADD COLUMN bio varchar(200),
        ADD COLUMN years_experience smallint,
        ADD COLUMN works_with_team boolean NOT NULL DEFAULT false,
        ADD COLUMN has_mobility boolean NOT NULL DEFAULT false,
        ADD COLUMN reference_rate numeric(12, 2),
        ADD COLUMN rate_mode rate_mode,
        ADD COLUMN free_quote boolean NOT NULL DEFAULT false,
        ADD COLUMN attention_status attention_status NOT NULL DEFAULT 'RESTING',
        ADD COLUMN attention_status_until timestamptz,
        ADD COLUMN auto_status_from_schedule boolean NOT NULL DEFAULT false,
        ADD COLUMN theme jsonb NOT NULL DEFAULT '{}'`);
    // Perfiles existentes (solo desarrollo y tests): un slug provisorio único.
    await q.query(
      `UPDATE professional_profiles SET slug = 'profesional-' || substr(replace(id::text, '-', ''), 1, 12)`,
    );
    await q.query(`
      ALTER TABLE professional_profiles
        ALTER COLUMN slug SET NOT NULL,
        ADD CONSTRAINT uq_professional_profiles_slug UNIQUE (slug),
        ADD CONSTRAINT ck_professional_profiles_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
        ADD CONSTRAINT ck_professional_profiles_years_experience
          CHECK (years_experience IS NULL OR years_experience BETWEEN 0 AND 70),
        ADD CONSTRAINT ck_professional_profiles_rate
          CHECK ((reference_rate IS NULL) = (rate_mode IS NULL) AND (reference_rate IS NULL OR reference_rate >= 0))`);

    await q.query(`CREATE TYPE pro_item_status AS ENUM ('ACTIVE', 'HIDDEN_BY_PLAN')`);
    await q.query(
      `ALTER TABLE professional_professions ADD COLUMN status pro_item_status NOT NULL DEFAULT 'ACTIVE'`,
    );

    // --- Medios ---
    await q.query(
      `CREATE TYPE media_purpose AS ENUM ('PRESENTATION', 'WORK', 'CATALOG_VIDEO', 'PROFILE_VIDEO', 'BANNER')`,
    );
    await q.query(
      `CREATE TYPE media_status AS ENUM ('ACTIVE', 'HIDDEN_BY_PLAN', 'HIDDEN_BY_ADMIN')`,
    );
    await q.query(`
      CREATE TABLE professional_media (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        professional_id uuid NOT NULL,
        file_id uuid NOT NULL,
        purpose media_purpose NOT NULL,
        position smallint NOT NULL DEFAULT 0,
        status media_status NOT NULL DEFAULT 'ACTIVE',
        hidden_by uuid,
        hidden_at timestamptz,
        hidden_reason varchar(300),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_professional_media PRIMARY KEY (id),
        CONSTRAINT uq_professional_media_file_id UNIQUE (file_id),
        CONSTRAINT fk_professional_media_professional_id FOREIGN KEY (professional_id)
          REFERENCES professional_profiles (id) ON DELETE RESTRICT,
        CONSTRAINT fk_professional_media_file_id FOREIGN KEY (file_id)
          REFERENCES stored_files (id) ON DELETE RESTRICT,
        CONSTRAINT fk_professional_media_hidden_by FOREIGN KEY (hidden_by)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT ck_professional_media_position CHECK (position >= 0),
        CONSTRAINT ck_professional_media_hidden
          CHECK (status <> 'HIDDEN_BY_ADMIN' OR (hidden_at IS NOT NULL AND hidden_reason IS NOT NULL))
      )`);
    await q.query(
      `CREATE INDEX ix_professional_media_professional_id ON professional_media (professional_id)`,
    );
    await q.query(`CREATE INDEX ix_professional_media_hidden_by ON professional_media (hidden_by)`);

    // --- Certificados (ADR 0020: públicos al subirlos, el admin puede ocultarlos) ---
    await q.query(`CREATE TYPE cert_status AS ENUM ('ACTIVE', 'HIDDEN_BY_ADMIN')`);
    await q.query(`
      CREATE TABLE professional_certifications (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        professional_id uuid NOT NULL,
        file_id uuid NOT NULL,
        title varchar(120) NOT NULL,
        institution varchar(120),
        issued_year smallint,
        status cert_status NOT NULL DEFAULT 'ACTIVE',
        sensitive_data_confirmed_at timestamptz NOT NULL,
        hidden_by uuid,
        hidden_at timestamptz,
        hidden_reason varchar(300),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_professional_certifications PRIMARY KEY (id),
        CONSTRAINT uq_professional_certifications_file_id UNIQUE (file_id),
        CONSTRAINT fk_professional_certifications_professional_id FOREIGN KEY (professional_id)
          REFERENCES professional_profiles (id) ON DELETE RESTRICT,
        CONSTRAINT fk_professional_certifications_file_id FOREIGN KEY (file_id)
          REFERENCES stored_files (id) ON DELETE RESTRICT,
        CONSTRAINT fk_professional_certifications_hidden_by FOREIGN KEY (hidden_by)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT ck_professional_certifications_issued_year
          CHECK (issued_year IS NULL OR issued_year BETWEEN 1950 AND 2100),
        CONSTRAINT ck_professional_certifications_hidden
          CHECK (status <> 'HIDDEN_BY_ADMIN' OR (hidden_at IS NOT NULL AND hidden_reason IS NOT NULL))
      )`);
    await q.query(
      `CREATE INDEX ix_professional_certifications_professional_id ON professional_certifications (professional_id)`,
    );
    await q.query(
      `CREATE INDEX ix_professional_certifications_hidden_by ON professional_certifications (hidden_by)`,
    );

    // --- Redes sociales ---
    await q.query(
      `CREATE TYPE social_network AS ENUM ('INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'LINKEDIN', 'YOUTUBE', 'WEBSITE')`,
    );
    await q.query(`
      CREATE TABLE professional_social_links (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        professional_id uuid NOT NULL,
        network social_network NOT NULL,
        url varchar(300) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_professional_social_links PRIMARY KEY (id),
        CONSTRAINT uq_professional_social_links_professional_id_network UNIQUE (professional_id, network),
        CONSTRAINT fk_professional_social_links_professional_id FOREIGN KEY (professional_id)
          REFERENCES professional_profiles (id) ON DELETE RESTRICT,
        CONSTRAINT ck_professional_social_links_url CHECK (url LIKE 'https://%')
      )`);

    // --- Disponibilidad (horas de Córdoba) ---
    await q.query(`
      CREATE TABLE availability_slots (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        professional_id uuid NOT NULL,
        weekday smallint NOT NULL,
        start_time time NOT NULL,
        end_time time NOT NULL,
        CONSTRAINT pk_availability_slots PRIMARY KEY (id),
        CONSTRAINT fk_availability_slots_professional_id FOREIGN KEY (professional_id)
          REFERENCES professional_profiles (id) ON DELETE RESTRICT,
        CONSTRAINT ck_availability_slots_weekday CHECK (weekday BETWEEN 1 AND 7),
        CONSTRAINT ck_availability_slots_range CHECK (start_time < end_time)
      )`);
    await q.query(
      `CREATE INDEX ix_availability_slots_professional_id ON availability_slots (professional_id)`,
    );
    await q.query(`CREATE TYPE exception_type AS ENUM ('DAY_OFF', 'HOLIDAY', 'VACATION')`);
    await q.query(`
      CREATE TABLE availability_exceptions (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        professional_id uuid NOT NULL,
        start_date date NOT NULL,
        end_date date NOT NULL,
        type exception_type NOT NULL,
        note varchar(120),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_availability_exceptions PRIMARY KEY (id),
        CONSTRAINT fk_availability_exceptions_professional_id FOREIGN KEY (professional_id)
          REFERENCES professional_profiles (id) ON DELETE RESTRICT,
        CONSTRAINT ck_availability_exceptions_range CHECK (end_date >= start_date)
      )`);
    await q.query(
      `CREATE INDEX ix_availability_exceptions_professional_id_end_date ON availability_exceptions (professional_id, end_date)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE availability_exceptions`);
    await q.query(`DROP TYPE exception_type`);
    await q.query(`DROP TABLE availability_slots`);
    await q.query(`DROP TABLE professional_social_links`);
    await q.query(`DROP TYPE social_network`);
    await q.query(`DROP TABLE professional_certifications`);
    await q.query(`DROP TYPE cert_status`);
    await q.query(`DROP TABLE professional_media`);
    await q.query(`DROP TYPE media_status`);
    await q.query(`DROP TYPE media_purpose`);
    await q.query(`ALTER TABLE professional_professions DROP COLUMN status`);
    await q.query(`DROP TYPE pro_item_status`);
    await q.query(`
      ALTER TABLE professional_profiles
        DROP CONSTRAINT ck_professional_profiles_rate,
        DROP CONSTRAINT ck_professional_profiles_years_experience,
        DROP CONSTRAINT ck_professional_profiles_slug,
        DROP CONSTRAINT uq_professional_profiles_slug,
        DROP COLUMN slug, DROP COLUMN business_name, DROP COLUMN bio, DROP COLUMN years_experience,
        DROP COLUMN works_with_team, DROP COLUMN has_mobility, DROP COLUMN reference_rate,
        DROP COLUMN rate_mode, DROP COLUMN free_quote, DROP COLUMN attention_status,
        DROP COLUMN attention_status_until, DROP COLUMN auto_status_from_schedule, DROP COLUMN theme`);
    await q.query(`DROP TYPE attention_status`);
    await q.query(`DROP TYPE rate_mode`);
    await q.query(`DROP TABLE customer_profiles`);
    await q.query(`ALTER TABLE identity_verifications DROP COLUMN kind`);
    await q.query(`DROP TYPE verification_kind`);
    await q.query(`DROP INDEX ix_users_pending_avatar_file_id`);
    await q.query(
      `ALTER TABLE users DROP CONSTRAINT fk_users_pending_avatar_file_id, DROP COLUMN pending_avatar_file_id`,
    );
    // PostgreSQL no permite quitar valores de un enum: se recrean los tipos sin los valores nuevos.
    await q.query(
      `ALTER TABLE stored_files ALTER COLUMN purpose TYPE text, ALTER COLUMN kind TYPE text`,
    );
    await q.query(`DROP TYPE file_purpose`);
    await q.query(`DROP TYPE file_kind`);
    await q.query(`CREATE TYPE file_purpose AS ENUM ('AVATAR')`);
    await q.query(`CREATE TYPE file_kind AS ENUM ('IMAGE', 'VIDEO')`);
    await q.query(`
      ALTER TABLE stored_files
        ALTER COLUMN purpose TYPE file_purpose USING purpose::file_purpose,
        ALTER COLUMN kind TYPE file_kind USING kind::file_kind`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Etapa 11 (ADR 0029): reportes, strikes, sanciones, apelaciones, soporte y novedades. Las fotos de
 * reportes y soporte son `file_purpose` = EVIDENCE (privadas; esta migración no usa el valor nuevo,
 * como exige PostgreSQL dentro de la misma transacción). Las suspensiones y baneos que ya existían
 * se copian a `sanctions`.
 */
export class Moderation1793640020000 implements MigrationInterface {
  name = 'Moderation1793640020000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE file_purpose ADD VALUE 'EVIDENCE'`);
    await q.query(
      `CREATE TYPE report_target AS ENUM ('PROFILE', 'MESSAGE', 'FORUM_POST', 'FORUM_REPLY', 'REVIEW')`,
    );
    await q.query(`
      CREATE TYPE report_reason AS ENUM
        ('DISCRIMINATION', 'DISRESPECT', 'HARASSMENT', 'NO_SHOW', 'NOT_AS_AGREED', 'FRAUD',
         'THREATS', 'OFFENSIVE_CONTENT', 'SPAM', 'OTHER')`);
    await q.query(
      `CREATE TYPE report_status AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'VALID', 'REJECTED')`,
    );
    await q.query(
      `CREATE TYPE sanction_type AS ENUM ('WARNING', 'SUSPENSION', 'BAN', 'PROFILE_HIDDEN')`,
    );
    await q.query(`CREATE TYPE appeal_status AS ENUM ('OPEN', 'ACCEPTED', 'REJECTED')`);
    await q.query(
      `CREATE TYPE support_category AS ENUM ('SUGGESTION', 'BUG', 'INCIDENT', 'COMPLAINT', 'OTHER')`,
    );
    await q.query(`CREATE TYPE ticket_status AS ENUM ('OPEN', 'ANSWERED', 'CLOSED')`);

    // --- Reportes ---
    await q.query(`
      CREATE TABLE reports (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        reporter_id uuid NOT NULL,
        target_type report_target NOT NULL,
        -- Sin FK: apunta a cinco tablas distintas según target_type (se valida en el servicio).
        target_id uuid NOT NULL,
        reported_user_id uuid NOT NULL,
        reason report_reason NOT NULL,
        description varchar(2000) NOT NULL,
        status report_status NOT NULL DEFAULT 'SUBMITTED',
        resolved_by uuid,
        resolved_at timestamptz,
        resolution_note varchar(500),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_reports PRIMARY KEY (id),
        CONSTRAINT fk_reports_reporter_id FOREIGN KEY (reporter_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_reports_reported_user_id FOREIGN KEY (reported_user_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_reports_resolved_by FOREIGN KEY (resolved_by)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT ck_reports_not_self CHECK (reporter_id <> reported_user_id),
        CONSTRAINT ck_reports_resolved
          CHECK ((status IN ('VALID', 'REJECTED')) = (resolved_at IS NOT NULL))
      )`);
    // Un reporte abierto por persona y contenido.
    await q.query(`
      CREATE UNIQUE INDEX uq_reports_open ON reports (reporter_id, target_type, target_id)
        WHERE status IN ('SUBMITTED', 'UNDER_REVIEW')`);
    await q.query(`CREATE INDEX ix_reports_reporter_id ON reports (reporter_id)`);
    await q.query(`CREATE INDEX ix_reports_reported_user_id ON reports (reported_user_id)`);
    await q.query(`CREATE INDEX ix_reports_resolved_by ON reports (resolved_by)`);
    await q.query(
      `CREATE INDEX ix_reports_target_type_target_id ON reports (target_type, target_id)`,
    );
    await q.query(`CREATE INDEX ix_reports_status ON reports (status)`);

    await q.query(`
      CREATE TABLE report_evidence (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        report_id uuid NOT NULL,
        file_id uuid NOT NULL,
        position smallint NOT NULL DEFAULT 0,
        CONSTRAINT pk_report_evidence PRIMARY KEY (id),
        CONSTRAINT uq_report_evidence_file_id UNIQUE (file_id),
        CONSTRAINT fk_report_evidence_report_id FOREIGN KEY (report_id)
          REFERENCES reports (id) ON DELETE RESTRICT,
        CONSTRAINT fk_report_evidence_file_id FOREIGN KEY (file_id)
          REFERENCES stored_files (id) ON DELETE RESTRICT,
        CONSTRAINT ck_report_evidence_position CHECK (position >= 0)
      )`);
    await q.query(`CREATE INDEX ix_report_evidence_report_id ON report_evidence (report_id)`);

    // --- Strikes y sanciones (manuales) ---
    await q.query(`
      CREATE TABLE strikes (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        report_id uuid,
        weight smallint NOT NULL,
        reason varchar(500) NOT NULL,
        applied_by uuid NOT NULL,
        voided_at timestamptz,
        voided_by uuid,
        void_reason varchar(500),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_strikes PRIMARY KEY (id),
        CONSTRAINT fk_strikes_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_strikes_report_id FOREIGN KEY (report_id)
          REFERENCES reports (id) ON DELETE RESTRICT,
        CONSTRAINT fk_strikes_applied_by FOREIGN KEY (applied_by)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_strikes_voided_by FOREIGN KEY (voided_by)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT ck_strikes_weight CHECK (weight BETWEEN 1 AND 3),
        CONSTRAINT ck_strikes_voided CHECK ((voided_at IS NULL) = (void_reason IS NULL))
      )`);
    await q.query(`CREATE INDEX ix_strikes_user_id ON strikes (user_id)`);
    await q.query(`CREATE INDEX ix_strikes_report_id ON strikes (report_id)`);
    await q.query(`CREATE INDEX ix_strikes_applied_by ON strikes (applied_by)`);
    await q.query(`CREATE INDEX ix_strikes_voided_by ON strikes (voided_by)`);

    await q.query(`
      CREATE TABLE sanctions (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        type sanction_type NOT NULL,
        report_id uuid,
        reason varchar(500) NOT NULL,
        starts_at timestamptz NOT NULL DEFAULT now(),
        ends_at timestamptz,
        applied_by uuid,
        lifted_at timestamptz,
        lifted_by uuid,
        lift_reason varchar(500),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_sanctions PRIMARY KEY (id),
        CONSTRAINT fk_sanctions_user_id FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_sanctions_report_id FOREIGN KEY (report_id)
          REFERENCES reports (id) ON DELETE RESTRICT,
        CONSTRAINT fk_sanctions_applied_by FOREIGN KEY (applied_by)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_sanctions_lifted_by FOREIGN KEY (lifted_by)
          REFERENCES users (id) ON DELETE RESTRICT,
        -- Fecha de fin solo en suspensiones y perfiles ocultos; el baneo dura hasta que se levante.
        CONSTRAINT ck_sanctions_ends
          CHECK (ends_at IS NULL OR (type IN ('SUSPENSION', 'PROFILE_HIDDEN') AND ends_at > starts_at)),
        CONSTRAINT ck_sanctions_lifted CHECK ((lifted_at IS NULL) = (lift_reason IS NULL))
      )`);
    await q.query(`CREATE INDEX ix_sanctions_user_id ON sanctions (user_id)`);
    await q.query(`CREATE INDEX ix_sanctions_report_id ON sanctions (report_id)`);
    await q.query(`CREATE INDEX ix_sanctions_applied_by ON sanctions (applied_by)`);
    await q.query(`CREATE INDEX ix_sanctions_lifted_by ON sanctions (lifted_by)`);
    // La tarea horaria busca las que vencen.
    await q.query(`
      CREATE INDEX ix_sanctions_expiring ON sanctions (ends_at)
        WHERE lifted_at IS NULL AND ends_at IS NOT NULL`);

    await q.query(`
      CREATE TABLE appeals (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        strike_id uuid,
        sanction_id uuid,
        body varchar(2000) NOT NULL,
        status appeal_status NOT NULL DEFAULT 'OPEN',
        decided_by uuid,
        decided_at timestamptz,
        decision_note varchar(500),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_appeals PRIMARY KEY (id),
        CONSTRAINT fk_appeals_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_appeals_strike_id FOREIGN KEY (strike_id)
          REFERENCES strikes (id) ON DELETE RESTRICT,
        CONSTRAINT fk_appeals_sanction_id FOREIGN KEY (sanction_id)
          REFERENCES sanctions (id) ON DELETE RESTRICT,
        CONSTRAINT fk_appeals_decided_by FOREIGN KEY (decided_by)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT ck_appeals_target CHECK ((strike_id IS NULL) <> (sanction_id IS NULL)),
        CONSTRAINT ck_appeals_decided CHECK ((status = 'OPEN') = (decided_at IS NULL))
      )`);
    await q.query(
      `CREATE UNIQUE INDEX uq_appeals_open_strike ON appeals (strike_id) WHERE status = 'OPEN'`,
    );
    await q.query(
      `CREATE UNIQUE INDEX uq_appeals_open_sanction ON appeals (sanction_id) WHERE status = 'OPEN'`,
    );
    await q.query(`CREATE INDEX ix_appeals_user_id ON appeals (user_id)`);
    await q.query(`CREATE INDEX ix_appeals_strike_id ON appeals (strike_id)`);
    await q.query(`CREATE INDEX ix_appeals_sanction_id ON appeals (sanction_id)`);
    await q.query(`CREATE INDEX ix_appeals_decided_by ON appeals (decided_by)`);

    // --- Soporte ---
    await q.query(`
      CREATE TABLE support_tickets (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        user_id uuid,
        contact_email citext,
        contact_name varchar(80),
        category support_category NOT NULL,
        status ticket_status NOT NULL DEFAULT 'OPEN',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_support_tickets PRIMARY KEY (id),
        CONSTRAINT fk_support_tickets_user_id FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        -- Del formulario público: hace falta un email para responder.
        CONSTRAINT ck_support_tickets_contact CHECK (user_id IS NOT NULL OR contact_email IS NOT NULL)
      )`);
    await q.query(`CREATE INDEX ix_support_tickets_user_id ON support_tickets (user_id)`);
    await q.query(`CREATE INDEX ix_support_tickets_status ON support_tickets (status)`);

    await q.query(`
      CREATE TABLE support_messages (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        ticket_id uuid NOT NULL,
        author_id uuid,
        from_staff boolean NOT NULL DEFAULT false,
        body varchar(2000) NOT NULL,
        file_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_support_messages PRIMARY KEY (id),
        CONSTRAINT uq_support_messages_file_id UNIQUE (file_id),
        CONSTRAINT fk_support_messages_ticket_id FOREIGN KEY (ticket_id)
          REFERENCES support_tickets (id) ON DELETE RESTRICT,
        CONSTRAINT fk_support_messages_author_id FOREIGN KEY (author_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_support_messages_file_id FOREIGN KEY (file_id)
          REFERENCES stored_files (id) ON DELETE RESTRICT,
        CONSTRAINT ck_support_messages_staff CHECK (NOT from_staff OR author_id IS NOT NULL)
      )`);
    await q.query(`CREATE INDEX ix_support_messages_ticket_id ON support_messages (ticket_id)`);
    await q.query(`CREATE INDEX ix_support_messages_author_id ON support_messages (author_id)`);

    // --- Novedades ---
    await q.query(`
      CREATE TABLE announcements (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        author_id uuid NOT NULL,
        title varchar(120) NOT NULL,
        body varchar(2000) NOT NULL,
        segment jsonb NOT NULL DEFAULT '{}',
        published_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_announcements PRIMARY KEY (id),
        CONSTRAINT fk_announcements_author_id FOREIGN KEY (author_id)
          REFERENCES users (id) ON DELETE RESTRICT
      )`);
    await q.query(`CREATE INDEX ix_announcements_author_id ON announcements (author_id)`);

    // Suspensiones y baneos anteriores: el historial empieza completo.
    await q.query(`
      INSERT INTO sanctions (user_id, type, reason, starts_at)
      SELECT u.id,
             CASE WHEN u.status = 'SUSPENDED' THEN 'SUSPENSION'::sanction_type
                  ELSE 'BAN'::sanction_type END,
             left(COALESCE(u.status_reason, 'Sanción anterior a la etapa 11'), 500),
             u.updated_at
        FROM users u
       WHERE u.status IN ('SUSPENDED', 'BANNED')`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE announcements`);
    await q.query(`DROP TABLE support_messages`);
    await q.query(`DROP TABLE support_tickets`);
    await q.query(`DROP TABLE appeals`);
    await q.query(`DROP TABLE sanctions`);
    await q.query(`DROP TABLE strikes`);
    await q.query(`DROP TABLE report_evidence`);
    await q.query(`DROP TABLE reports`);
    await q.query(`DROP TYPE ticket_status`);
    await q.query(`DROP TYPE support_category`);
    await q.query(`DROP TYPE appeal_status`);
    await q.query(`DROP TYPE sanction_type`);
    await q.query(`DROP TYPE report_status`);
    await q.query(`DROP TYPE report_reason`);
    await q.query(`DROP TYPE report_target`);
    // PostgreSQL no permite quitar valores de un enum: se recrea sin EVIDENCE.
    await q.query(`ALTER TABLE stored_files ALTER COLUMN purpose TYPE text`);
    await q.query(`DROP TYPE file_purpose`);
    await q.query(`
      CREATE TYPE file_purpose AS ENUM
        ('AVATAR', 'PROFILE_MEDIA', 'CERTIFICATE', 'CHAT_ATTACHMENT', 'FORUM_MEDIA')`);
    await q.query(
      `ALTER TABLE stored_files ALTER COLUMN purpose TYPE file_purpose USING purpose::file_purpose`,
    );
  }
}

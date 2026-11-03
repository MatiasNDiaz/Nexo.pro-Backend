import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Etapa 8 (ADR 0024 y 0025): chat, solicitudes, presupuestos, contrataciones y notificaciones
 * internas. Adjuntos de chat como archivos privados (`file_purpose` = CHAT_ATTACHMENT; esta migración
 * no usa el valor nuevo, como exige PostgreSQL dentro de la misma transacción).
 */
export class ChatRequestsContracts1793640017000 implements MigrationInterface {
  name = 'ChatRequestsContracts1793640017000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE file_purpose ADD VALUE 'CHAT_ATTACHMENT'`);

    // --- Chat ---
    await q.query(`
      CREATE TABLE conversations (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        customer_id uuid NOT NULL,
        professional_id uuid NOT NULL,
        customer_last_read_at timestamptz,
        professional_last_read_at timestamptz,
        last_message_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_conversations PRIMARY KEY (id),
        CONSTRAINT uq_conversations_customer_id_professional_id UNIQUE (customer_id, professional_id),
        CONSTRAINT fk_conversations_customer_id FOREIGN KEY (customer_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_conversations_professional_id FOREIGN KEY (professional_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT ck_conversations_participants CHECK (customer_id <> professional_id)
      )`);
    await q.query(
      `CREATE INDEX ix_conversations_professional_id ON conversations (professional_id)`,
    );

    await q.query(`CREATE TYPE request_urgency AS ENUM ('CAN_WAIT', 'IMPATIENT', 'URGENT')`);
    await q.query(`CREATE TYPE request_status AS ENUM ('OPEN', 'SELECTED', 'CANCELLED')`);
    await q.query(`
      CREATE TABLE service_requests (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        customer_id uuid NOT NULL,
        profession_id uuid NOT NULL,
        description varchar(1000) NOT NULL,
        urgency request_urgency NOT NULL,
        status request_status NOT NULL DEFAULT 'OPEN',
        cancel_reason varchar(300),
        cancelled_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_service_requests PRIMARY KEY (id),
        CONSTRAINT fk_service_requests_customer_id FOREIGN KEY (customer_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_service_requests_profession_id FOREIGN KEY (profession_id)
          REFERENCES professions (id) ON DELETE RESTRICT,
        CONSTRAINT ck_service_requests_cancelled
          CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL))
      )`);
    await q.query(`CREATE INDEX ix_service_requests_customer_id ON service_requests (customer_id)`);
    await q.query(
      `CREATE INDEX ix_service_requests_profession_id ON service_requests (profession_id)`,
    );

    await q.query(`CREATE TYPE message_sender AS ENUM ('CUSTOMER', 'PROFESSIONAL', 'SYSTEM')`);
    await q.query(`
      CREATE TABLE messages (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        conversation_id uuid NOT NULL,
        sender_id uuid,
        sender_type message_sender NOT NULL,
        body text NOT NULL DEFAULT '',
        original_body text,
        service_request_id uuid,
        edited_at timestamptz,
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_messages PRIMARY KEY (id),
        CONSTRAINT fk_messages_conversation_id FOREIGN KEY (conversation_id)
          REFERENCES conversations (id) ON DELETE RESTRICT,
        CONSTRAINT fk_messages_sender_id FOREIGN KEY (sender_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_messages_service_request_id FOREIGN KEY (service_request_id)
          REFERENCES service_requests (id) ON DELETE RESTRICT,
        CONSTRAINT ck_messages_sender CHECK ((sender_type = 'SYSTEM') = (sender_id IS NULL)),
        CONSTRAINT ck_messages_body CHECK (char_length(body) <= 2000)
      )`);
    await q.query(
      `CREATE INDEX ix_messages_conversation_id_created_at ON messages (conversation_id, created_at)`,
    );
    await q.query(`CREATE INDEX ix_messages_sender_id ON messages (sender_id)`);
    await q.query(`CREATE INDEX ix_messages_service_request_id ON messages (service_request_id)`);

    await q.query(`
      CREATE TABLE message_attachments (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        message_id uuid NOT NULL,
        file_id uuid NOT NULL,
        position smallint NOT NULL DEFAULT 0,
        CONSTRAINT pk_message_attachments PRIMARY KEY (id),
        CONSTRAINT uq_message_attachments_file_id UNIQUE (file_id),
        CONSTRAINT fk_message_attachments_message_id FOREIGN KEY (message_id)
          REFERENCES messages (id) ON DELETE RESTRICT,
        CONSTRAINT fk_message_attachments_file_id FOREIGN KEY (file_id)
          REFERENCES stored_files (id) ON DELETE RESTRICT
      )`);
    await q.query(
      `CREATE INDEX ix_message_attachments_message_id ON message_attachments (message_id)`,
    );

    // --- Negociación y contratación ---
    await q.query(`
      CREATE TYPE target_status AS ENUM
        ('PENDING', 'IN_DISCUSSION', 'QUOTED', 'SELECTED', 'NOT_SELECTED', 'DECLINED', 'CANCELLED')`);
    await q.query(`
      CREATE TABLE service_request_targets (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        request_id uuid NOT NULL,
        professional_id uuid NOT NULL,
        conversation_id uuid NOT NULL,
        status target_status NOT NULL DEFAULT 'PENDING',
        responded_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_service_request_targets PRIMARY KEY (id),
        CONSTRAINT uq_service_request_targets_request_id_professional_id
          UNIQUE (request_id, professional_id),
        CONSTRAINT fk_service_request_targets_request_id FOREIGN KEY (request_id)
          REFERENCES service_requests (id) ON DELETE RESTRICT,
        CONSTRAINT fk_service_request_targets_professional_id FOREIGN KEY (professional_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_service_request_targets_conversation_id FOREIGN KEY (conversation_id)
          REFERENCES conversations (id) ON DELETE RESTRICT
      )`);
    await q.query(
      `CREATE INDEX ix_service_request_targets_professional_id ON service_request_targets (professional_id)`,
    );
    await q.query(
      `CREATE INDEX ix_service_request_targets_conversation_id ON service_request_targets (conversation_id)`,
    );

    await q.query(
      `CREATE TYPE quote_status AS ENUM ('SENT', 'SUPERSEDED', 'WITHDRAWN', 'ACCEPTED', 'REJECTED')`,
    );
    await q.query(`
      CREATE TABLE quotes (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        target_id uuid NOT NULL,
        amount numeric(12, 2) NOT NULL,
        currency char(3) NOT NULL DEFAULT 'ARS',
        description varchar(1000),
        proposed_date timestamptz,
        status quote_status NOT NULL DEFAULT 'SENT',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_quotes PRIMARY KEY (id),
        CONSTRAINT fk_quotes_target_id FOREIGN KEY (target_id)
          REFERENCES service_request_targets (id) ON DELETE RESTRICT,
        CONSTRAINT ck_quotes_amount CHECK (amount >= 0),
        CONSTRAINT ck_quotes_currency CHECK (currency ~ '^[A-Z]{3}$')
      )`);
    await q.query(`CREATE INDEX ix_quotes_target_id ON quotes (target_id)`);
    // Un solo presupuesto vigente por profesional y pedido: corregirlo reemplaza al anterior.
    await q.query(
      `CREATE UNIQUE INDEX uq_quotes_target_sent ON quotes (target_id) WHERE status = 'SENT'`,
    );

    await q.query(`
      CREATE TYPE contract_status AS ENUM
        ('ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED_BY_CLIENT', 'CANCELLED_BY_PRO')`);
    await q.query(`
      CREATE TABLE service_contracts (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        request_id uuid NOT NULL,
        target_id uuid NOT NULL,
        customer_id uuid NOT NULL,
        professional_id uuid NOT NULL,
        accepted_quote_id uuid,
        status contract_status NOT NULL DEFAULT 'ACCEPTED',
        scheduled_at timestamptz,
        started_at timestamptz,
        completed_at timestamptz,
        cancelled_at timestamptz,
        cancel_reason varchar(300),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_service_contracts PRIMARY KEY (id),
        CONSTRAINT uq_service_contracts_request_id UNIQUE (request_id),
        CONSTRAINT uq_service_contracts_target_id UNIQUE (target_id),
        CONSTRAINT fk_service_contracts_request_id FOREIGN KEY (request_id)
          REFERENCES service_requests (id) ON DELETE RESTRICT,
        CONSTRAINT fk_service_contracts_target_id FOREIGN KEY (target_id)
          REFERENCES service_request_targets (id) ON DELETE RESTRICT,
        CONSTRAINT fk_service_contracts_customer_id FOREIGN KEY (customer_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_service_contracts_professional_id FOREIGN KEY (professional_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_service_contracts_accepted_quote_id FOREIGN KEY (accepted_quote_id)
          REFERENCES quotes (id) ON DELETE RESTRICT
      )`);
    await q.query(
      `CREATE INDEX ix_service_contracts_customer_id ON service_contracts (customer_id)`,
    );
    await q.query(
      `CREATE INDEX ix_service_contracts_professional_id ON service_contracts (professional_id)`,
    );
    await q.query(
      `CREATE INDEX ix_service_contracts_accepted_quote_id ON service_contracts (accepted_quote_id)`,
    );

    await q.query(`
      CREATE TABLE service_contract_history (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        contract_id uuid NOT NULL,
        from_status contract_status,
        to_status contract_status NOT NULL,
        actor_id uuid,
        reason varchar(300),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_service_contract_history PRIMARY KEY (id),
        CONSTRAINT fk_service_contract_history_contract_id FOREIGN KEY (contract_id)
          REFERENCES service_contracts (id) ON DELETE RESTRICT,
        CONSTRAINT fk_service_contract_history_actor_id FOREIGN KEY (actor_id)
          REFERENCES users (id) ON DELETE RESTRICT
      )`);
    await q.query(
      `CREATE INDEX ix_service_contract_history_contract_id ON service_contract_history (contract_id)`,
    );
    await q.query(
      `CREATE INDEX ix_service_contract_history_actor_id ON service_contract_history (actor_id)`,
    );

    // --- Notificaciones internas ---
    await q.query(`
      CREATE TABLE notifications (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        type varchar(40) NOT NULL,
        title varchar(120) NOT NULL,
        body varchar(300) NOT NULL,
        target_type varchar(20),
        target_id uuid,
        read_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_notifications PRIMARY KEY (id),
        CONSTRAINT fk_notifications_user_id FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE RESTRICT
      )`);
    await q.query(
      `CREATE INDEX ix_notifications_user_id_created_at ON notifications (user_id, created_at)`,
    );
    await q.query(
      `CREATE INDEX ix_notifications_unread ON notifications (user_id) WHERE read_at IS NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE notifications`);
    await q.query(`DROP TABLE service_contract_history`);
    await q.query(`DROP TABLE service_contracts`);
    await q.query(`DROP TYPE contract_status`);
    await q.query(`DROP TABLE quotes`);
    await q.query(`DROP TYPE quote_status`);
    await q.query(`DROP TABLE service_request_targets`);
    await q.query(`DROP TYPE target_status`);
    await q.query(`DROP TABLE message_attachments`);
    await q.query(`DROP TABLE messages`);
    await q.query(`DROP TYPE message_sender`);
    await q.query(`DROP TABLE service_requests`);
    await q.query(`DROP TYPE request_status`);
    await q.query(`DROP TYPE request_urgency`);
    await q.query(`DROP TABLE conversations`);
    // PostgreSQL no permite quitar valores de un enum: se recrea sin CHAT_ATTACHMENT.
    await q.query(`ALTER TABLE stored_files ALTER COLUMN purpose TYPE text`);
    await q.query(`DROP TYPE file_purpose`);
    await q.query(`CREATE TYPE file_purpose AS ENUM ('AVATAR', 'PROFILE_MEDIA', 'CERTIFICATE')`);
    await q.query(
      `ALTER TABLE stored_files ALTER COLUMN purpose TYPE file_purpose USING purpose::file_purpose`,
    );
  }
}

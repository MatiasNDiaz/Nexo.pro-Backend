import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Etapa 9 (ADR 0026): pagos con Mercado Pago. Estados de la suscripción sin débito automático
 * (TRIAL, ACTIVE, EXPIRED), lo pagado por período, pagos con lo que otorgaron y avisos del proveedor.
 */
export class Payments1793640018000 implements MigrationInterface {
  name = 'Payments1793640018000';

  public async up(q: QueryRunner): Promise<void> {
    // --- Suscripciones: estados sin CANCEL_AT_PERIOD_END ni PAST_DUE (no hay filas con esos valores) ---
    await q.query(`DROP INDEX uq_subscriptions_live`);
    await q.query(`DROP INDEX ix_subscriptions_trial_ends_at`);
    await q.query(`ALTER TABLE subscriptions DROP CONSTRAINT ck_subscriptions_trial`);
    await q.query(`CREATE TYPE subscription_status_new AS ENUM ('TRIAL', 'ACTIVE', 'EXPIRED')`);
    await q.query(`
      ALTER TABLE subscriptions
        ALTER COLUMN status TYPE subscription_status_new USING status::text::subscription_status_new`);
    await q.query(`
      ALTER TABLE subscription_history
        ALTER COLUMN from_status TYPE subscription_status_new
          USING from_status::text::subscription_status_new,
        ALTER COLUMN to_status TYPE subscription_status_new
          USING to_status::text::subscription_status_new`);
    await q.query(`DROP TYPE subscription_status`);
    await q.query(`ALTER TYPE subscription_status_new RENAME TO subscription_status`);
    await this.subscriptionConstraints(q);

    await q.query(
      `ALTER TABLE subscriptions RENAME COLUMN last_trial_reminder_days TO last_reminder_days`,
    );
    await q.query(`
      ALTER TABLE subscriptions
        ADD COLUMN period_amount_paid numeric(12, 2),
        ADD CONSTRAINT ck_subscriptions_amount_paid
          CHECK (period_amount_paid IS NULL OR period_amount_paid >= 0)`);

    // --- Pagos ---
    await q.query(`CREATE TYPE payment_purpose AS ENUM ('SUBSCRIPTION', 'UPGRADE_DIFFERENCE')`);
    await q.query(`
      CREATE TYPE payment_status AS ENUM
        ('CREATED', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED', 'CHARGED_BACK')`);
    await q.query(`
      CREATE TABLE payments (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        subscription_id uuid NOT NULL,
        plan_id uuid NOT NULL,
        purpose payment_purpose NOT NULL,
        amount numeric(12, 2) NOT NULL,
        currency char(3) NOT NULL DEFAULT 'ARS',
        status payment_status NOT NULL DEFAULT 'CREATED',
        provider varchar(20) NOT NULL,
        provider_preference_id varchar(100),
        provider_payment_id varchar(100),
        approved_at timestamptz,
        applied_at timestamptz,
        granted_from timestamptz,
        granted_until timestamptz,
        previous_plan_id uuid,
        reverted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_payments PRIMARY KEY (id),
        CONSTRAINT uq_payments_provider_payment_id UNIQUE (provider_payment_id),
        CONSTRAINT fk_payments_user_id FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_payments_subscription_id FOREIGN KEY (subscription_id)
          REFERENCES subscriptions (id) ON DELETE RESTRICT,
        CONSTRAINT fk_payments_plan_id FOREIGN KEY (plan_id)
          REFERENCES subscription_plans (id) ON DELETE RESTRICT,
        CONSTRAINT fk_payments_previous_plan_id FOREIGN KEY (previous_plan_id)
          REFERENCES subscription_plans (id) ON DELETE RESTRICT,
        CONSTRAINT ck_payments_amount CHECK (amount > 0),
        CONSTRAINT ck_payments_currency CHECK (currency ~ '^[A-Z]{3}$'),
        CONSTRAINT ck_payments_provider CHECK (provider IN ('MERCADOPAGO')),
        CONSTRAINT ck_payments_granted
          CHECK ((granted_from IS NULL) = (granted_until IS NULL) AND
                 (granted_from IS NULL OR granted_until > granted_from)),
        CONSTRAINT ck_payments_reverted CHECK (reverted_at IS NULL OR applied_at IS NOT NULL)
      )`);
    await q.query(`CREATE INDEX ix_payments_user_id ON payments (user_id)`);
    await q.query(`CREATE INDEX ix_payments_subscription_id ON payments (subscription_id)`);
    await q.query(`CREATE INDEX ix_payments_plan_id ON payments (plan_id)`);
    await q.query(`CREATE INDEX ix_payments_previous_plan_id ON payments (previous_plan_id)`);

    await q.query(`
      CREATE TABLE payment_events (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        provider varchar(20) NOT NULL,
        provider_event_id varchar(100) NOT NULL,
        event_type varchar(60) NOT NULL,
        payment_id uuid,
        payload_minimized jsonb NOT NULL DEFAULT '{}',
        received_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz,
        processing_error varchar(200),
        CONSTRAINT pk_payment_events PRIMARY KEY (id),
        CONSTRAINT uq_payment_events_provider_provider_event_id UNIQUE (provider, provider_event_id),
        CONSTRAINT fk_payment_events_payment_id FOREIGN KEY (payment_id)
          REFERENCES payments (id) ON DELETE RESTRICT
      )`);
    await q.query(`CREATE INDEX ix_payment_events_payment_id ON payment_events (payment_id)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE payment_events`);
    await q.query(`DROP TABLE payments`);
    await q.query(`DROP TYPE payment_status`);
    await q.query(`DROP TYPE payment_purpose`);
    await q.query(`
      ALTER TABLE subscriptions
        DROP CONSTRAINT ck_subscriptions_amount_paid,
        DROP COLUMN period_amount_paid`);
    await q.query(
      `ALTER TABLE subscriptions RENAME COLUMN last_reminder_days TO last_trial_reminder_days`,
    );
    await q.query(`DROP INDEX uq_subscriptions_live`);
    await q.query(`DROP INDEX ix_subscriptions_trial_ends_at`);
    await q.query(`ALTER TABLE subscriptions DROP CONSTRAINT ck_subscriptions_trial`);
    await q.query(`
      CREATE TYPE subscription_status_old AS ENUM
        ('TRIAL', 'ACTIVE', 'CANCEL_AT_PERIOD_END', 'PAST_DUE', 'EXPIRED')`);
    await q.query(`
      ALTER TABLE subscriptions
        ALTER COLUMN status TYPE subscription_status_old USING status::text::subscription_status_old`);
    await q.query(`
      ALTER TABLE subscription_history
        ALTER COLUMN from_status TYPE subscription_status_old
          USING from_status::text::subscription_status_old,
        ALTER COLUMN to_status TYPE subscription_status_old
          USING to_status::text::subscription_status_old`);
    await q.query(`DROP TYPE subscription_status`);
    await q.query(`ALTER TYPE subscription_status_old RENAME TO subscription_status`);
    await this.subscriptionConstraints(q);
  }

  /** Índices y check que dependen del tipo de estado (se recrean al cambiarlo). */
  private async subscriptionConstraints(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE subscriptions ADD CONSTRAINT ck_subscriptions_trial
        CHECK (status <> 'TRIAL' OR trial_ends_at IS NOT NULL)`);
    await q.query(
      `CREATE UNIQUE INDEX uq_subscriptions_live ON subscriptions (user_id) WHERE status <> 'EXPIRED'`,
    );
    await q.query(
      `CREATE INDEX ix_subscriptions_trial_ends_at ON subscriptions (trial_ends_at) WHERE status = 'TRIAL'`,
    );
  }
}

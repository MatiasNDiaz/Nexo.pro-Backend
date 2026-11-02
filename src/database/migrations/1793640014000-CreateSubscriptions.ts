import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Suscripciones y prueba de 30 días (ADR 0017), y pesos máximos por plan (ADR 0018). Los cobros
 * con Mercado Pago llegan en la etapa 9 (y agregan sus estados al enum).
 */
export class CreateSubscriptions1793640014000 implements MigrationInterface {
  name = 'CreateSubscriptions1793640014000';

  public async up(q: QueryRunner): Promise<void> {
    // Pesos por plan: los valores aprobados para los planes ya cargados; el seed los trae en bases nuevas.
    await q.query(`
      ALTER TABLE subscription_plans
        ADD COLUMN max_image_bytes bigint NOT NULL DEFAULT 5242880,
        ADD COLUMN max_video_bytes bigint NOT NULL DEFAULT 31457280`);
    await q.query(
      `UPDATE subscription_plans SET max_image_bytes = 10485760, max_video_bytes = 52428800 WHERE code = 'PREMIUM'`,
    );
    await q.query(`
      ALTER TABLE subscription_plans
        ALTER COLUMN max_image_bytes DROP DEFAULT,
        ALTER COLUMN max_video_bytes DROP DEFAULT,
        ADD CONSTRAINT ck_subscription_plans_file_sizes
          CHECK (max_image_bytes > 0 AND max_video_bytes > 0)`);

    await q.query(
      `CREATE TYPE subscription_status AS ENUM ('TRIAL', 'ACTIVE', 'CANCEL_AT_PERIOD_END', 'PAST_DUE', 'EXPIRED')`,
    );
    await q.query(`
      CREATE TABLE subscriptions (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        plan_id uuid NOT NULL,
        status subscription_status NOT NULL,
        trial_ends_at timestamptz,
        current_period_start timestamptz,
        current_period_end timestamptz,
        last_trial_reminder_days smallint,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_subscriptions PRIMARY KEY (id),
        CONSTRAINT fk_subscriptions_user_id FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_subscriptions_plan_id FOREIGN KEY (plan_id)
          REFERENCES subscription_plans (id) ON DELETE RESTRICT,
        CONSTRAINT ck_subscriptions_trial CHECK (status <> 'TRIAL' OR trial_ends_at IS NOT NULL),
        CONSTRAINT ck_subscriptions_reminder
          CHECK (last_trial_reminder_days IS NULL OR last_trial_reminder_days IN (7, 3, 1))
      )`);
    // Una sola suscripción viva por usuario (FI §6.4).
    await q.query(`
      CREATE UNIQUE INDEX uq_subscriptions_live
        ON subscriptions (user_id) WHERE status <> 'EXPIRED'`);
    await q.query(`CREATE INDEX ix_subscriptions_user_id ON subscriptions (user_id)`);
    await q.query(`CREATE INDEX ix_subscriptions_plan_id ON subscriptions (plan_id)`);
    // La tarea diaria busca pruebas por vencer.
    await q.query(
      `CREATE INDEX ix_subscriptions_trial_ends_at ON subscriptions (trial_ends_at) WHERE status = 'TRIAL'`,
    );

    await q.query(`
      CREATE TABLE subscription_history (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        subscription_id uuid NOT NULL,
        event varchar(40) NOT NULL,
        from_plan_id uuid,
        to_plan_id uuid,
        from_status subscription_status,
        to_status subscription_status,
        actor_id uuid,
        reason text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_subscription_history PRIMARY KEY (id),
        CONSTRAINT fk_subscription_history_subscription_id FOREIGN KEY (subscription_id)
          REFERENCES subscriptions (id) ON DELETE RESTRICT,
        CONSTRAINT fk_subscription_history_from_plan_id FOREIGN KEY (from_plan_id)
          REFERENCES subscription_plans (id) ON DELETE RESTRICT,
        CONSTRAINT fk_subscription_history_to_plan_id FOREIGN KEY (to_plan_id)
          REFERENCES subscription_plans (id) ON DELETE RESTRICT,
        CONSTRAINT fk_subscription_history_actor_id FOREIGN KEY (actor_id)
          REFERENCES users (id) ON DELETE RESTRICT
      )`);
    await q.query(
      `CREATE INDEX ix_subscription_history_subscription_id ON subscription_history (subscription_id)`,
    );
    await q.query(
      `CREATE INDEX ix_subscription_history_from_plan_id ON subscription_history (from_plan_id)`,
    );
    await q.query(
      `CREATE INDEX ix_subscription_history_to_plan_id ON subscription_history (to_plan_id)`,
    );
    await q.query(
      `CREATE INDEX ix_subscription_history_actor_id ON subscription_history (actor_id)`,
    );

    // Profesionales existentes (desarrollo y tests): prueba contada desde su registro.
    await q.query(`
      INSERT INTO subscriptions (user_id, plan_id, status, trial_ends_at)
      SELECT u.id, p.id,
             CASE WHEN u.created_at + interval '30 days' > now()
                  THEN 'TRIAL'::subscription_status ELSE 'EXPIRED'::subscription_status END,
             u.created_at + interval '30 days'
        FROM users u
        JOIN subscription_plans p ON p.code = 'BASIC'
       WHERE u.role = 'PROFESSIONAL' AND u.deleted_at IS NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE subscription_history`);
    await q.query(`DROP TABLE subscriptions`);
    await q.query(`DROP TYPE subscription_status`);
    await q.query(`
      ALTER TABLE subscription_plans
        DROP CONSTRAINT ck_subscription_plans_file_sizes,
        DROP COLUMN max_image_bytes,
        DROP COLUMN max_video_bytes`);
  }
}

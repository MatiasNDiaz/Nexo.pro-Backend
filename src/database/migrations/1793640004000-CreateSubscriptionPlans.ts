import { MigrationInterface, QueryRunner } from 'typeorm';

/** Planes con precios y límites configurables (plan §8.2.4). Los valores iniciales los carga el seed. */
export class CreateSubscriptionPlans1793640004000 implements MigrationInterface {
  name = 'CreateSubscriptionPlans1793640004000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE theme_level AS ENUM ('NONE', 'STANDARD', 'EXTENDED')`);
    await q.query(`
      CREATE TABLE subscription_plans (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        code varchar(20) NOT NULL,
        name varchar(60) NOT NULL,
        price_amount numeric(12,2) NOT NULL,
        currency char(3) NOT NULL DEFAULT 'ARS',
        max_professions smallint NOT NULL,
        max_images smallint NOT NULL,
        max_videos smallint NOT NULL,
        max_video_seconds smallint NOT NULL,
        theme_level theme_level NOT NULL,
        ranking_tier smallint NOT NULL,
        availability_alerts boolean NOT NULL,
        custom_alert_message boolean NOT NULL,
        metrics_enabled boolean NOT NULL,
        chatbot_enabled boolean NOT NULL,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_subscription_plans PRIMARY KEY (id),
        CONSTRAINT uq_subscription_plans_code UNIQUE (code),
        CONSTRAINT ck_subscription_plans_price CHECK (price_amount >= 0),
        CONSTRAINT ck_subscription_plans_currency CHECK (currency ~ '^[A-Z]{3}$'),
        CONSTRAINT ck_subscription_plans_limits CHECK (
          max_professions >= 1 AND max_images >= 0 AND max_videos >= 0
          AND max_video_seconds > 0 AND ranking_tier >= 0
        )
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE subscription_plans`);
    await q.query(`DROP TYPE theme_level`);
  }
}

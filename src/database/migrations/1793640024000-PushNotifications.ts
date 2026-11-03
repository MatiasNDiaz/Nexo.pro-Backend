import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Etapa 13.3 (ADR 0032): notificaciones push web. Una suscripción por navegador, atada a la cuenta
 * y al dispositivo (familia de sesión): solo recibe avisos mientras ese dispositivo tiene una sesión
 * abierta. Preferencias por categoría: sin fila, el push está activado.
 */
export class PushNotifications1793640024000 implements MigrationInterface {
  name = 'PushNotifications1793640024000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE push_subscriptions (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        family_id uuid NOT NULL,
        endpoint varchar(1000) NOT NULL,
        p256dh varchar(100) NOT NULL,
        auth varchar(50) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_success_at timestamptz,
        failure_count smallint NOT NULL DEFAULT 0,
        CONSTRAINT pk_push_subscriptions PRIMARY KEY (id),
        CONSTRAINT uq_push_subscriptions_endpoint UNIQUE (endpoint),
        -- Descartable como las sesiones: se borra con la cuenta.
        CONSTRAINT fk_push_subscriptions_user_id FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT ck_push_subscriptions_endpoint CHECK (endpoint LIKE 'https://%'),
        CONSTRAINT ck_push_subscriptions_failure_count CHECK (failure_count >= 0)
      )`);
    await q.query(`CREATE INDEX ix_push_subscriptions_user_id ON push_subscriptions (user_id)`);
    await q.query(`CREATE INDEX ix_push_subscriptions_family_id ON push_subscriptions (family_id)`);

    await q.query(`
      CREATE TYPE notification_category AS ENUM
        ('MESSAGES', 'REQUESTS', 'ACCOUNT', 'COMMUNITY', 'FAVORITES', 'ANNOUNCEMENTS', 'ADMIN_ALERTS')`);
    await q.query(`
      CREATE TABLE notification_preferences (
        user_id uuid NOT NULL,
        category notification_category NOT NULL,
        push boolean NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_notification_preferences PRIMARY KEY (user_id, category),
        CONSTRAINT fk_notification_preferences_user_id FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE CASCADE
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE notification_preferences`);
    await q.query(`DROP TYPE notification_category`);
    await q.query(`DROP TABLE push_subscriptions`);
  }
}

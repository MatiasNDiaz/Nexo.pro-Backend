import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ciclo de vida de la cuenta (etapa 6):
 * - `users.status_reason`: motivo de una suspensión o baneo, visible para el usuario (ADR 0007).
 *   En la etapa 11 lo complementan las sanciones.
 * - Una cuenta borrada (anonimizada, ADR 0013) puede quedar sin barrio aunque fuera cliente.
 * - `professional_profiles.deactivated_at`: el perfil anterior queda inactivo al cambiar de rol
 *   (ADR 0012) o al dar de baja la cuenta.
 */
export class AccountLifecycle1793640009000 implements MigrationInterface {
  name = 'AccountLifecycle1793640009000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE users ADD COLUMN status_reason varchar(500)`);
    await q.query(`
      ALTER TABLE users
        DROP CONSTRAINT ck_users_customer_neighborhood,
        ADD CONSTRAINT ck_users_customer_neighborhood
          CHECK (role <> 'CUSTOMER' OR neighborhood_id IS NOT NULL OR deleted_at IS NOT NULL)`);
    await q.query(`ALTER TABLE professional_profiles ADD COLUMN deactivated_at timestamptz`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE professional_profiles DROP COLUMN deactivated_at`);
    await q.query(`
      ALTER TABLE users
        DROP CONSTRAINT ck_users_customer_neighborhood,
        ADD CONSTRAINT ck_users_customer_neighborhood
          CHECK (role <> 'CUSTOMER' OR neighborhood_id IS NOT NULL)`);
    await q.query(`ALTER TABLE users DROP COLUMN status_reason`);
  }
}

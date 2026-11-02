import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extensiones. `citext` se usa para emails sin distinguir mayúsculas (etapa 5).
 * Los UUID usan `gen_random_uuid()`, nativo desde PostgreSQL 13: no hace falta pgcrypto.
 */
export class InitDatabase1793640000000 implements MigrationInterface {
  name = 'InitDatabase1793640000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS citext`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP EXTENSION IF EXISTS citext`);
  }
}

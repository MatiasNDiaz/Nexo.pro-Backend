import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Etapa 12: índice para la limpieza diaria de sesiones vencidas y marca de borrado real en el
 * almacenamiento (los archivos DELETED sin esa marca se reintentan; los que ya estaban DELETED
 * arrancan sin marca y se reintentan una vez: borrar lo que no existe no falla).
 */
export class Hardening1793640021000 implements MigrationInterface {
  name = 'Hardening1793640021000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE INDEX ix_auth_sessions_expires_at ON auth_sessions (expires_at)`);
    await q.query(`ALTER TABLE stored_files ADD COLUMN storage_deleted_at timestamptz`);
    await q.query(`
      CREATE INDEX ix_stored_files_storage_pending ON stored_files (updated_at)
        WHERE status = 'DELETED' AND storage_deleted_at IS NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX ix_stored_files_storage_pending`);
    await q.query(`ALTER TABLE stored_files DROP COLUMN storage_deleted_at`);
    await q.query(`DROP INDEX ix_auth_sessions_expires_at`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Archivos (ADR 0018): una fila por archivo, con dueño, propósito, tipo y estado. El binario vive
 * en Cloudinary (o en disco en desarrollo); acá solo metadatos verificados. Agrega la foto de perfil.
 * Los propósitos de la etapa 7.2 (medios, certificados) se suman con `ALTER TYPE … ADD VALUE`.
 */
export class CreateStoredFiles1793640011000 implements MigrationInterface {
  name = 'CreateStoredFiles1793640011000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE file_purpose AS ENUM ('AVATAR')`);
    await q.query(`CREATE TYPE file_kind AS ENUM ('IMAGE', 'VIDEO')`);
    await q.query(`CREATE TYPE file_visibility AS ENUM ('PUBLIC', 'PRIVATE')`);
    await q.query(
      `CREATE TYPE file_status AS ENUM ('PENDING_UPLOAD', 'READY', 'REJECTED', 'DELETED')`,
    );
    await q.query(`
      CREATE TABLE stored_files (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        owner_user_id uuid NOT NULL,
        provider varchar(20) NOT NULL,
        storage_key varchar(200) NOT NULL,
        purpose file_purpose NOT NULL,
        kind file_kind NOT NULL,
        visibility file_visibility NOT NULL,
        status file_status NOT NULL DEFAULT 'PENDING_UPLOAD',
        mime_type varchar(50),
        size_bytes bigint,
        duration_ms integer,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_stored_files PRIMARY KEY (id),
        CONSTRAINT uq_stored_files_storage_key UNIQUE (storage_key),
        CONSTRAINT fk_stored_files_owner_user_id FOREIGN KEY (owner_user_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT ck_stored_files_provider CHECK (provider IN ('CLOUDINARY', 'LOCAL')),
        CONSTRAINT ck_stored_files_metadata CHECK (
          (size_bytes IS NULL OR size_bytes >= 0)
          AND (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 15500)
        ),
        CONSTRAINT ck_stored_files_ready
          CHECK (status <> 'READY' OR (mime_type IS NOT NULL AND size_bytes IS NOT NULL))
      )`);
    await q.query(`CREATE INDEX ix_stored_files_owner_user_id ON stored_files (owner_user_id)`);
    // Solo los pendientes: los usa la limpieza de subidas abandonadas.
    await q.query(
      `CREATE INDEX ix_stored_files_pending ON stored_files (created_at) WHERE status = 'PENDING_UPLOAD'`,
    );

    await q.query(`
      ALTER TABLE users
        ADD COLUMN avatar_file_id uuid,
        ADD CONSTRAINT fk_users_avatar_file_id FOREIGN KEY (avatar_file_id)
          REFERENCES stored_files (id) ON DELETE RESTRICT`);
    await q.query(`CREATE INDEX ix_users_avatar_file_id ON users (avatar_file_id)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX ix_users_avatar_file_id`);
    await q.query(
      `ALTER TABLE users DROP CONSTRAINT fk_users_avatar_file_id, DROP COLUMN avatar_file_id`,
    );
    await q.query(`DROP TABLE stored_files`);
    await q.query(`DROP TYPE file_status`);
    await q.query(`DROP TYPE file_visibility`);
    await q.query(`DROP TYPE file_kind`);
    await q.query(`DROP TYPE file_purpose`);
  }
}

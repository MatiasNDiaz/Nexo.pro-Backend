import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Barrios creados por los usuarios (ADR 0010): estado PENDING/APPROVED/MERGED, nombre normalizado
 * único por localidad (los fusionados quedan como alias) y trazabilidad de quién lo cargó y revisó.
 *
 * Las filas que ya existían (datos de ejemplo de la etapa 4) quedan APPROVED. Su `normalized_name`
 * se calcula en SQL con una aproximación de `normalizeNeighborhoodName()` válida para esos nombres.
 */
export class UserCreatedNeighborhoods1793640006000 implements MigrationInterface {
  name = 'UserCreatedNeighborhoods1793640006000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE neighborhood_status AS ENUM ('PENDING', 'APPROVED', 'MERGED')`);
    await q.query(`
      ALTER TABLE neighborhoods
        ADD COLUMN normalized_name varchar(120),
        ADD COLUMN status neighborhood_status NOT NULL DEFAULT 'APPROVED',
        ADD COLUMN merged_into_id uuid,
        ADD COLUMN created_by_user_id uuid,
        ADD COLUMN reviewed_by_id uuid,
        ADD COLUMN reviewed_at timestamptz`);
    await q.query(`
      UPDATE neighborhoods SET normalized_name = lower(trim(regexp_replace(
        translate(name, 'ÁÉÍÓÚÜÑÀÈÌÒÙáéíóúüñàèìòù', 'AEIOUUNAEIOUaeiouunaeiou'),
        '[^A-Za-z0-9]+', ' ', 'g')))`);
    await q.query(`
      ALTER TABLE neighborhoods
        ALTER COLUMN normalized_name SET NOT NULL,
        ALTER COLUMN status SET DEFAULT 'PENDING'`);

    await q.query(`DROP INDEX uq_neighborhoods_locality_id_name_lower`);
    await q.query(`ALTER TABLE neighborhoods DROP COLUMN active`);
    await q.query(`
      ALTER TABLE neighborhoods
        ADD CONSTRAINT uq_neighborhoods_locality_id_normalized_name
          UNIQUE (locality_id, normalized_name),
        ADD CONSTRAINT uq_neighborhoods_id_locality_id UNIQUE (id, locality_id),
        ADD CONSTRAINT fk_neighborhoods_merged_into_id FOREIGN KEY (merged_into_id)
          REFERENCES neighborhoods (id) ON DELETE RESTRICT,
        ADD CONSTRAINT fk_neighborhoods_created_by_user_id FOREIGN KEY (created_by_user_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        ADD CONSTRAINT fk_neighborhoods_reviewed_by_id FOREIGN KEY (reviewed_by_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        ADD CONSTRAINT ck_neighborhoods_merge
          CHECK ((status = 'MERGED') = (merged_into_id IS NOT NULL) AND merged_into_id <> id)`);
    await q.query(`CREATE INDEX ix_neighborhoods_merged_into_id ON neighborhoods (merged_into_id)`);
    await q.query(
      `CREATE INDEX ix_neighborhoods_created_by_user_id ON neighborhoods (created_by_user_id)`,
    );
    await q.query(`CREATE INDEX ix_neighborhoods_reviewed_by_id ON neighborhoods (reviewed_by_id)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX ix_neighborhoods_reviewed_by_id`);
    await q.query(`DROP INDEX ix_neighborhoods_created_by_user_id`);
    await q.query(`DROP INDEX ix_neighborhoods_merged_into_id`);
    await q.query(`
      ALTER TABLE neighborhoods
        DROP CONSTRAINT ck_neighborhoods_merge,
        DROP CONSTRAINT fk_neighborhoods_reviewed_by_id,
        DROP CONSTRAINT fk_neighborhoods_created_by_user_id,
        DROP CONSTRAINT fk_neighborhoods_merged_into_id,
        DROP CONSTRAINT uq_neighborhoods_id_locality_id,
        DROP CONSTRAINT uq_neighborhoods_locality_id_normalized_name`);
    // Los alias fusionados no tienen equivalente en el esquema anterior: se descartan.
    await q.query(`DELETE FROM neighborhoods WHERE status = 'MERGED'`);
    await q.query(`ALTER TABLE neighborhoods ADD COLUMN active boolean NOT NULL DEFAULT true`);
    await q.query(
      `CREATE UNIQUE INDEX uq_neighborhoods_locality_id_name_lower ON neighborhoods (locality_id, lower(name))`,
    );
    await q.query(`
      ALTER TABLE neighborhoods
        DROP COLUMN reviewed_at,
        DROP COLUMN reviewed_by_id,
        DROP COLUMN created_by_user_id,
        DROP COLUMN merged_into_id,
        DROP COLUMN status,
        DROP COLUMN normalized_name`);
    await q.query(`DROP TYPE neighborhood_status`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

const COORDINATES_CHECK =
  '(lat IS NULL) = (lng IS NULL) AND (lat IS NULL OR lat BETWEEN -90 AND 90) AND (lng IS NULL OR lng BETWEEN -180 AND 180)';

/** Provincias, localidades y barrios (plan §8.2.2). Los borrados son lógicos (`active`). */
export class CreateLocations1793640002000 implements MigrationInterface {
  name = 'CreateLocations1793640002000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE provinces (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        name varchar(100) NOT NULL,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_provinces PRIMARY KEY (id)
      )`);
    await q.query(`CREATE UNIQUE INDEX uq_provinces_name_lower ON provinces (lower(name))`);

    await q.query(`
      CREATE TABLE localities (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        province_id uuid NOT NULL,
        name varchar(120) NOT NULL,
        lat numeric(9,6),
        lng numeric(9,6),
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_localities PRIMARY KEY (id),
        CONSTRAINT fk_localities_province_id FOREIGN KEY (province_id)
          REFERENCES provinces (id) ON DELETE RESTRICT,
        CONSTRAINT ck_localities_coordinates CHECK (${COORDINATES_CHECK})
      )`);
    // También sirve como índice de la FK (province_id es la primera columna).
    await q.query(
      `CREATE UNIQUE INDEX uq_localities_province_id_name_lower ON localities (province_id, lower(name))`,
    );

    await q.query(`
      CREATE TABLE neighborhoods (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        locality_id uuid NOT NULL,
        name varchar(120) NOT NULL,
        lat numeric(9,6),
        lng numeric(9,6),
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_neighborhoods PRIMARY KEY (id),
        CONSTRAINT fk_neighborhoods_locality_id FOREIGN KEY (locality_id)
          REFERENCES localities (id) ON DELETE RESTRICT,
        CONSTRAINT ck_neighborhoods_coordinates CHECK (${COORDINATES_CHECK})
      )`);
    await q.query(
      `CREATE UNIQUE INDEX uq_neighborhoods_locality_id_name_lower ON neighborhoods (locality_id, lower(name))`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE neighborhoods`);
    await q.query(`DROP TABLE localities`);
    await q.query(`DROP TABLE provinces`);
  }
}

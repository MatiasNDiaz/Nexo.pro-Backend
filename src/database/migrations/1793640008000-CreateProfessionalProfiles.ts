import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Perfil profesional mínimo, sus profesiones y sus zonas de trabajo (ADR 0006 y 0010).
 * El resto del perfil se agrega en la etapa 7.
 */
export class CreateProfessionalProfiles1793640008000 implements MigrationInterface {
  name = 'CreateProfessionalProfiles1793640008000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE professional_profiles (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_professional_profiles PRIMARY KEY (id),
        CONSTRAINT uq_professional_profiles_user_id UNIQUE (user_id),
        CONSTRAINT fk_professional_profiles_user_id FOREIGN KEY (user_id)
          REFERENCES users (id) ON DELETE RESTRICT
      )`);

    await q.query(`
      CREATE TABLE professional_professions (
        professional_id uuid NOT NULL,
        profession_id uuid NOT NULL,
        is_primary boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_professional_professions PRIMARY KEY (professional_id, profession_id),
        CONSTRAINT fk_professional_professions_professional_id FOREIGN KEY (professional_id)
          REFERENCES professional_profiles (id) ON DELETE RESTRICT,
        CONSTRAINT fk_professional_professions_profession_id FOREIGN KEY (profession_id)
          REFERENCES professions (id) ON DELETE RESTRICT
      )`);
    await q.query(`
      CREATE UNIQUE INDEX uq_professional_professions_primary
        ON professional_professions (professional_id) WHERE is_primary`);
    await q.query(
      `CREATE INDEX ix_professional_professions_profession_id ON professional_professions (profession_id)`,
    );

    await q.query(`
      CREATE TABLE professional_service_areas (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        professional_id uuid NOT NULL,
        locality_id uuid NOT NULL,
        neighborhood_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_professional_service_areas PRIMARY KEY (id),
        CONSTRAINT fk_professional_service_areas_professional_id FOREIGN KEY (professional_id)
          REFERENCES professional_profiles (id) ON DELETE RESTRICT,
        CONSTRAINT fk_professional_service_areas_locality_id FOREIGN KEY (locality_id)
          REFERENCES localities (id) ON DELETE RESTRICT,
        CONSTRAINT fk_professional_service_areas_neighborhood_id_locality_id
          FOREIGN KEY (neighborhood_id, locality_id)
          REFERENCES neighborhoods (id, locality_id) ON DELETE RESTRICT
      )`);
    // NULL = toda la localidad; NULLS NOT DISTINCT impide repetirla.
    await q.query(`
      CREATE UNIQUE INDEX uq_professional_service_areas_zone
        ON professional_service_areas (professional_id, locality_id, neighborhood_id)
        NULLS NOT DISTINCT`);
    await q.query(
      `CREATE INDEX ix_professional_service_areas_locality_id ON professional_service_areas (locality_id)`,
    );
    await q.query(
      `CREATE INDEX ix_professional_service_areas_neighborhood_id ON professional_service_areas (neighborhood_id)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE professional_service_areas`);
    await q.query(`DROP TABLE professional_professions`);
    await q.query(`DROP TABLE professional_profiles`);
  }
}

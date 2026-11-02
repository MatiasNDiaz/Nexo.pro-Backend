import { MigrationInterface, QueryRunner } from 'typeorm';

/** Catálogo de oficios (plan §8.2.2). La personalización por oficio (`page_theme`) llega en la etapa 7. */
export class CreateProfessions1793640003000 implements MigrationInterface {
  name = 'CreateProfessions1793640003000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE professions (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        name varchar(80) NOT NULL,
        slug varchar(80) NOT NULL,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_professions PRIMARY KEY (id),
        CONSTRAINT uq_professions_slug UNIQUE (slug),
        CONSTRAINT ck_professions_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
      )`);
    await q.query(`CREATE UNIQUE INDEX uq_professions_name_lower ON professions (lower(name))`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE professions`);
  }
}

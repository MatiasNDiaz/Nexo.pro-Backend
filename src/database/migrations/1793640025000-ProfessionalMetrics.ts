import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Etapa 13.4 (ADR 0033): métricas Premium. Solo totales por día y por profesional (personas
 * distintas que vieron el perfil, apariciones en búsquedas y veces primero): nunca quién miró.
 */
export class ProfessionalMetrics1793640025000 implements MigrationInterface {
  name = 'ProfessionalMetrics1793640025000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE professional_metrics_daily (
        professional_id uuid NOT NULL,
        day date NOT NULL,
        profile_viewers integer NOT NULL DEFAULT 0,
        search_appearances integer NOT NULL DEFAULT 0,
        first_place integer NOT NULL DEFAULT 0,
        CONSTRAINT pk_professional_metrics_daily PRIMARY KEY (professional_id, day),
        CONSTRAINT fk_professional_metrics_daily_professional_id FOREIGN KEY (professional_id)
          REFERENCES professional_profiles (id) ON DELETE RESTRICT,
        CONSTRAINT ck_professional_metrics_daily_counts
          CHECK (profile_viewers >= 0 AND search_appearances >= 0 AND first_place >= 0)
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE professional_metrics_daily`);
  }
}

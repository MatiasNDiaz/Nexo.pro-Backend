import { DataSource, EntityManager } from 'typeorm';
import { LOCATIONS_SEED, PROFESSIONS_SEED, SUBSCRIPTION_PLANS_SEED } from './catalogs.data';

export interface SeedResult {
  provinces: number;
  localities: number;
  professions: number;
  plans: number;
}

/**
 * Carga los catálogos maestros de forma idempotente: `ON CONFLICT DO NOTHING` sobre la clave
 * natural, así correrlo dos veces no duplica nada y no pisa cambios del admin. Todo en una
 * transacción: o se carga completo o no se carga nada.
 */
export function seedCatalogs(dataSource: DataSource): Promise<SeedResult> {
  return dataSource.transaction(async (manager) => {
    const result: SeedResult = {
      provinces: 0,
      localities: 0,
      professions: 0,
      plans: 0,
    };

    for (const province of LOCATIONS_SEED) {
      result.provinces += await insertIgnoring(
        manager,
        `INSERT INTO provinces (name) VALUES ($1) ON CONFLICT ((lower(name))) DO NOTHING`,
        [province.province],
      );
      const provinceId = await provinceIdOf(manager, province.province);

      for (const locality of province.localities) {
        result.localities += await insertIgnoring(
          manager,
          `INSERT INTO localities (province_id, name) VALUES ($1, $2)
           ON CONFLICT (province_id, (lower(name))) DO NOTHING`,
          [provinceId, locality],
        );
      }
    }

    for (const profession of PROFESSIONS_SEED) {
      result.professions += await insertIgnoring(
        manager,
        `INSERT INTO professions (name, slug) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [profession.name, profession.slug],
      );
    }

    for (const plan of SUBSCRIPTION_PLANS_SEED) {
      result.plans += await insertIgnoring(
        manager,
        `INSERT INTO subscription_plans (code, name, price_amount, max_professions, max_images,
           max_videos, max_video_seconds, theme_level, ranking_tier, availability_alerts,
           custom_alert_message, metrics_enabled, chatbot_enabled, max_image_bytes, max_video_bytes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (code) DO NOTHING`,
        [
          plan.code,
          plan.name,
          plan.priceAmount,
          plan.maxProfessions,
          plan.maxImages,
          plan.maxVideos,
          plan.maxVideoSeconds,
          plan.themeLevel,
          plan.rankingTier,
          plan.availabilityAlerts,
          plan.customAlertMessage,
          plan.metricsEnabled,
          plan.chatbotEnabled,
          plan.maxImageBytes,
          plan.maxVideoBytes,
        ],
      );
    }

    return result;
  });
}

/** Ejecuta un INSERT … ON CONFLICT DO NOTHING y devuelve cuántas filas insertó (0 o 1). */
async function insertIgnoring(
  manager: EntityManager,
  sql: string,
  params: unknown[],
): Promise<number> {
  const rows: unknown[] = await manager.query(`${sql} RETURNING 1`, params);
  return rows.length;
}

async function provinceIdOf(manager: EntityManager, name: string): Promise<string> {
  const rows: Array<{ id: string }> = await manager.query(
    `SELECT id FROM provinces WHERE lower(name) = lower($1)`,
    [name],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('No se encontró la provincia semilla');
  return id;
}

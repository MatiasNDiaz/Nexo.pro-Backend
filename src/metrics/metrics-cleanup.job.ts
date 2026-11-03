import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { CORDOBA_TIME_ZONE } from '../common/calendar-periods';
import { ADVISORY_LOCKS, runExclusive } from '../database/advisory-lock';

/** Se guardan 25 meses: alcanza para comparar un mes con el mismo del año anterior (ADR 0033). */
export const METRICS_RETENTION_MONTHS = 25;

/** Borra los días con más de 25 meses (fecha de Córdoba). Devuelve cuántas filas borró. */
export async function purgeOldMetrics(dataSource: DataSource, now = new Date()): Promise<number> {
  const [, deleted]: [unknown, number] = await dataSource.query(
    `DELETE FROM professional_metrics_daily
      WHERE day < (($1::timestamptz AT TIME ZONE '${CORDOBA_TIME_ZONE}')::date
                   - make_interval(months => $2))::date`,
    [now, METRICS_RETENTION_MONTHS],
  );
  return deleted;
}

/** Todos los días a las 4:30 de Córdoba, después de la limpieza de sesiones. */
@Injectable()
export class MetricsCleanupJob {
  private readonly logger = new Logger(MetricsCleanupJob.name);

  constructor(private readonly dataSource: DataSource) {}

  @Cron('30 4 * * *', {
    name: 'metrics-cleanup',
    timeZone: 'America/Argentina/Cordoba',
    waitForCompletion: true,
  })
  async run(): Promise<void> {
    try {
      const outcome = await runExclusive(this.dataSource, ADVISORY_LOCKS.METRICS_CLEANUP, () =>
        purgeOldMetrics(this.dataSource),
      );
      if (outcome.ran) this.logger.log(`Limpieza de métricas: ${outcome.result} días borrados`);
    } catch (error) {
      this.logger.error('Falló la limpieza de métricas', error as Error);
    }
  }
}

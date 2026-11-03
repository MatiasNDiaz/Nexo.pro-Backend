import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { ADVISORY_LOCKS, runExclusive } from '../database/advisory-lock';
import { PaymentsService } from './payments.service';

/**
 * Cada hora: vence los períodos pagos cumplidos y aplica los cambios de plan pagados por
 * adelantado cuando empieza su período. Mientras tanto, la API ya trata como vencido un período
 * cumplido (catálogo y límites), así que la demora solo afecta al historial y al plan nuevo.
 */
@Injectable()
export class BillingJob {
  private readonly logger = new Logger(BillingJob.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly payments: PaymentsService,
  ) {}

  @Cron('5 * * * *', { name: 'billing', waitForCompletion: true })
  async run(): Promise<void> {
    try {
      const outcome = await runExclusive(this.dataSource, ADVISORY_LOCKS.BILLING, () =>
        this.payments.refreshDue(),
      );
      if (outcome.ran && outcome.result > 0) {
        this.logger.log(`Suscripciones actualizadas: ${outcome.result}`);
      }
    } catch (error) {
      this.logger.error('Falló la tarea de períodos pagos', error as Error);
    }
  }
}

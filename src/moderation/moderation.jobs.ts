import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { ADVISORY_LOCKS, runExclusive } from '../database/advisory-lock';
import { SanctionsService } from './sanctions.service';

/** Cada hora: levanta las suspensiones y perfiles ocultos cuya fecha de fin llegó (ADR 0029). */
@Injectable()
export class SanctionsExpiryJob {
  private readonly logger = new Logger(SanctionsExpiryJob.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly sanctions: SanctionsService,
  ) {}

  @Cron('10 * * * *', { name: 'sanctions-expiry', waitForCompletion: true })
  async run(): Promise<void> {
    try {
      const outcome = await runExclusive(this.dataSource, ADVISORY_LOCKS.SANCTIONS, () =>
        this.sanctions.expireDue(),
      );
      if (outcome.ran && outcome.result > 0) {
        this.logger.log(`Sanciones levantadas por vencimiento: ${outcome.result}`);
      }
    } catch (error) {
      this.logger.error('Falló la tarea de vencimiento de sanciones', error as Error);
    }
  }
}

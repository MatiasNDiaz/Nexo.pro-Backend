import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { ADVISORY_LOCKS, runExclusive } from '../database/advisory-lock';
import { UploadsService } from './uploads.service';

/** Cada hora descarta las subidas que nunca se confirmaron (y borra su binario). */
@Injectable()
export class UploadsCleanupJob {
  private readonly logger = new Logger(UploadsCleanupJob.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly uploads: UploadsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'uploads-cleanup', waitForCompletion: true })
  async run(): Promise<void> {
    try {
      const outcome = await runExclusive(this.dataSource, ADVISORY_LOCKS.UPLOADS_CLEANUP, () =>
        this.uploads.discardStalePendingUploads(),
      );
      if (outcome.ran && outcome.result > 0) {
        this.logger.log(`Subidas abandonadas descartadas: ${outcome.result}`);
      }
    } catch (error) {
      this.logger.error('Falló la limpieza de subidas abandonadas', error as Error);
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SecurityAlertsService } from './security-alerts.service';

/** Cada 15 minutos: revisa las señales de seguridad (SEG §20.3). */
@Injectable()
export class SecurityAlertsJob {
  private readonly logger = new Logger(SecurityAlertsJob.name);

  constructor(private readonly alerts: SecurityAlertsService) {}

  @Cron('*/15 * * * *', { name: 'security-alerts', waitForCompletion: true })
  async run(): Promise<void> {
    try {
      await this.alerts.check();
    } catch (error) {
      this.logger.error('Falló la revisión de alertas de seguridad', error as Error);
    }
  }
}

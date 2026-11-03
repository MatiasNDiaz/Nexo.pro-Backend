import { Global, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ErrorCounters } from './error-counters';
import { ErrorReporter } from './error-reporter';
import { SecurityAlertsJob } from './monitoring.jobs';
import { SecurityAlertsService } from './security-alerts.service';

/**
 * Monitoreo (SEG §20.3): contadores de errores, reporte a Sentry y alertas de seguridad. Global:
 * lo usa el filtro de errores.
 */
@Global()
@Module({
  imports: [NotificationsModule],
  providers: [ErrorCounters, ErrorReporter, SecurityAlertsService, SecurityAlertsJob],
  exports: [ErrorCounters, ErrorReporter, SecurityAlertsService],
})
export class MonitoringModule {}

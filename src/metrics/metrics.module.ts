import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { MetricsCleanupJob } from './metrics-cleanup.job';
import { MetricsCollector } from './metrics-collector.service';
import { MetricsViewerService } from './metrics-viewer.service';
import { AdminMetricsController, MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

/** Métricas Premium (ADR 0033): el catálogo cuenta, el profesional y el admin las leen. */
@Module({
  imports: [AuthModule, SubscriptionsModule],
  controllers: [MetricsController, AdminMetricsController],
  providers: [MetricsCollector, MetricsViewerService, MetricsService, MetricsCleanupJob],
  exports: [MetricsCollector, MetricsViewerService],
})
export class MetricsModule {}

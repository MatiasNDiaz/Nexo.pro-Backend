import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionMailListener, TrialsJob } from './subscriptions.jobs';
import { SubscriptionsService } from './subscriptions.service';

/** Módulo "de abajo": no importa perfiles, archivos ni chat (plan §6, sin ciclos). */
@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, TrialsJob, SubscriptionMailListener],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}

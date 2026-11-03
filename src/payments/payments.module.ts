import { Module } from '@nestjs/common';
import { PaymentProviderModule } from '../integrations/payments/payment-provider.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  AdminPaymentsController,
  PaymentsController,
  PaymentsWebhookController,
} from './payments.controller';
import { BillingJob } from './payments.jobs';
import { PaymentsService } from './payments.service';

/** Pagos con Mercado Pago (ADR 0026). Avisa los cambios de plan por evento: no importa perfiles. */
@Module({
  imports: [PaymentProviderModule, NotificationsModule],
  controllers: [PaymentsController, AdminPaymentsController, PaymentsWebhookController],
  providers: [PaymentsService, BillingJob],
})
export class PaymentsModule {}

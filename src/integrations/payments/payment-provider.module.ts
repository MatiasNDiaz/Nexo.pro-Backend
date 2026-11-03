import { Module } from '@nestjs/common';
import { type PaymentsConfig, paymentsConfig } from '../../config/payments.config';
import { FakePaymentProvider } from './fake-payment.provider';
import { MercadoPagoProvider } from './mercadopago.provider';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider';

/** `null` con PAYMENTS_PROVIDER=disabled: el checkout responde 503 y el webhook 404. */
export function createPaymentProvider(config: PaymentsConfig): PaymentProvider | null {
  switch (config.provider) {
    case 'disabled':
      return null;
    case 'fake':
      return new FakePaymentProvider(config.webhookSecret);
    case 'mercadopago':
      return new MercadoPagoProvider(config.accessToken, config.webhookSecret);
  }
}

@Module({
  providers: [
    { provide: PAYMENT_PROVIDER, inject: [paymentsConfig.KEY], useFactory: createPaymentProvider },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentProviderModule {}

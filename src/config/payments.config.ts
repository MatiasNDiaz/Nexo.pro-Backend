import { ConfigType, registerAs } from '@nestjs/config';
import { validateEnv } from './env.validation';

/** Pagos con Mercado Pago (ADR 0026). Sin credenciales, el adaptador simulado o apagado. */
export const paymentsConfig = registerAs('payments', () => {
  const env = validateEnv(process.env);
  const apiUrl = env.API_PUBLIC_URL ?? '';
  return {
    provider: env.PAYMENTS_PROVIDER,
    accessToken: env.MERCADOPAGO_ACCESS_TOKEN ?? '',
    webhookSecret: env.MERCADOPAGO_WEBHOOK_SECRET ?? '',
    /** Donde Mercado Pago avisa los cambios de cada pago. */
    notificationUrl: apiUrl ? `${apiUrl}/${env.API_PREFIX}/v1/webhooks/payments` : '',
    /** Página del frontend a la que vuelve la persona después de pagar. */
    returnUrl: `${env.FRONTEND_URL}/suscripcion/resultado`,
  };
});

export type PaymentsConfig = ConfigType<typeof paymentsConfig>;

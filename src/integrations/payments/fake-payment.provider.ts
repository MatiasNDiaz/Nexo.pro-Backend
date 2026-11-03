import { randomInt, randomUUID } from 'node:crypto';
import { mercadoPagoSignature, parseMercadoPagoWebhook } from './mercadopago-signature';
import {
  type CheckoutInput,
  type CheckoutSession,
  type PaymentNotice,
  type PaymentProvider,
  PaymentProviderError,
  type PaymentWebhookRequest,
  type ProviderPayment,
  type ProviderPaymentStatus,
} from './payment-provider';

/**
 * Mercado Pago simulado, SOLO para desarrollo y tests (la validación del entorno lo prohíbe en
 * producción). Firma los avisos igual que Mercado Pago, así los tests pasan por la misma
 * validación de firma que el adaptador real.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'MERCADOPAGO';
  private readonly checkouts = new Map<string, CheckoutInput>();
  private readonly payments = new Map<string, ProviderPayment>();
  /**
   * Ids numéricos como los de Mercado Pago, distintos en cada instancia: varias apps (una por suite
   * de tests) comparten la base, donde el id del pago y el del aviso son únicos.
   */
  private nextId = Date.now() * 1000 + randomInt(1000);

  constructor(private readonly webhookSecret: string) {}

  createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const preferenceId = `fake-pref-${randomUUID()}`;
    this.checkouts.set(input.paymentId, input);
    return Promise.resolve({
      preferenceId,
      checkoutUrl: `https://fake-mercadopago.local/checkout/${preferenceId}`,
    });
  }

  fetchPayment(providerPaymentId: string): Promise<ProviderPayment> {
    const payment = this.payments.get(providerPaymentId);
    if (!payment) return Promise.reject(new PaymentProviderError('Pago desconocido'));
    return Promise.resolve({ ...payment });
  }

  parseWebhook(request: PaymentWebhookRequest): PaymentNotice {
    return parseMercadoPagoWebhook(this.webhookSecret, request);
  }

  // ---- Utilidades para simular a Mercado Pago en desarrollo y tests ----

  /**
   * Simula que la persona pagó el checkout de ese pago nuestro. `overrides` permite simular lo que
   * Mercado Pago informaría distinto (monto, moneda o plan). Devuelve el id de Mercado Pago.
   */
  pay(
    paymentId: string,
    status: ProviderPaymentStatus = 'APPROVED',
    overrides: Partial<Pick<ProviderPayment, 'amount' | 'currency' | 'planCode'>> = {},
  ): string {
    const checkout = this.checkouts.get(paymentId);
    if (!checkout) throw new Error('Checkout desconocido');
    const providerPaymentId = String(this.nextId++);
    this.payments.set(providerPaymentId, {
      providerPaymentId,
      externalReference: paymentId,
      status,
      amount: checkout.amount,
      currency: checkout.currency,
      planCode: checkout.planCode,
      approvedAt: status === 'APPROVED' ? new Date() : null,
      ...overrides,
    });
    return providerPaymentId;
  }

  /** Cambia el estado de un pago (p. ej. un reembolso o un contracargo). */
  setStatus(providerPaymentId: string, status: ProviderPaymentStatus): void {
    const payment = this.payments.get(providerPaymentId);
    if (!payment) throw new Error('Pago desconocido');
    payment.status = status;
  }

  /** Aviso firmado como lo manda Mercado Pago. */
  buildSignedWebhook(providerPaymentId: string, action = 'payment.updated'): PaymentWebhookRequest {
    const requestId = randomUUID();
    const ts = String(Date.now());
    const v1 = mercadoPagoSignature(this.webhookSecret, providerPaymentId, requestId, ts);
    return {
      headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
      query: { 'data.id': providerPaymentId, type: 'payment' },
      rawBody: Buffer.from(
        JSON.stringify({
          id: String(this.nextId++),
          action,
          type: 'payment',
          data: { id: providerPaymentId },
        }),
      ),
    };
  }
}

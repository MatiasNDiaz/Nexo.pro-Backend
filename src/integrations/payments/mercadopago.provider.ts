import { parseMercadoPagoWebhook } from './mercadopago-signature';
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

const API_URL = 'https://api.mercadopago.com';
const TIMEOUT_MS = 10_000;

/** Estados de Mercado Pago → los nuestros. Los intermedios quedan como PENDING. */
const STATUS: Record<string, ProviderPaymentStatus> = {
  approved: 'APPROVED',
  pending: 'PENDING',
  in_process: 'PENDING',
  authorized: 'PENDING',
  in_mediation: 'PENDING',
  rejected: 'REJECTED',
  cancelled: 'CANCELLED',
  refunded: 'REFUNDED',
  charged_back: 'CHARGED_BACK',
};

interface MpPayment {
  id: number | string;
  status: string;
  transaction_amount: number;
  currency_id: string;
  external_reference?: string | null;
  date_approved?: string | null;
  metadata?: { plan_code?: unknown } | null;
  additional_info?: { items?: Array<{ id?: unknown }> } | null;
}

/**
 * Mercado Pago por su API REST con `fetch` (sin el SDK, ADR 0026). Checkout Pro: se crea una
 * preferencia y la persona paga en Mercado Pago. Nunca se registra el token ni las respuestas.
 */
export class MercadoPagoProvider implements PaymentProvider {
  readonly name = 'MERCADOPAGO';

  constructor(
    private readonly accessToken: string,
    private readonly webhookSecret: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const body = {
      items: [
        {
          id: input.planCode,
          title: input.title,
          quantity: 1,
          unit_price: Number(input.amount),
          currency_id: input.currency,
        },
      ],
      external_reference: input.paymentId,
      metadata: { plan_code: input.planCode },
      notification_url: input.notificationUrl,
      back_urls: { success: input.returnUrl, pending: input.returnUrl, failure: input.returnUrl },
      // Mercado Pago solo vuelve solo a la página si es https.
      ...(input.returnUrl.startsWith('https://') && { auto_return: 'approved' }),
    };
    const created = await this.request<{ id: string; init_point: string }>(
      'POST',
      '/checkout/preferences',
      body,
      input.paymentId,
    );
    if (typeof created.id !== 'string' || typeof created.init_point !== 'string') {
      throw new PaymentProviderError('Respuesta inesperada al crear el checkout');
    }
    return { preferenceId: created.id, checkoutUrl: created.init_point };
  }

  async fetchPayment(providerPaymentId: string): Promise<ProviderPayment> {
    if (!/^\d{1,30}$/.test(providerPaymentId)) {
      throw new PaymentProviderError('Id de pago inválido');
    }
    return toProviderPayment(
      await this.request<MpPayment>('GET', `/v1/payments/${providerPaymentId}`),
    );
  }

  parseWebhook(request: PaymentWebhookRequest): PaymentNotice {
    return parseMercadoPagoWebhook(this.webhookSecret, request);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchFn(`${API_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey && { 'X-Idempotency-Key': idempotencyKey }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new PaymentProviderError('Mercado Pago no respondió');
    }
    if (!response.ok) {
      throw new PaymentProviderError(`Mercado Pago respondió ${response.status}`);
    }
    return (await response.json()) as T;
  }
}

export function toProviderPayment(payment: MpPayment): ProviderPayment {
  const status = STATUS[payment.status];
  if (!status || typeof payment.transaction_amount !== 'number') {
    throw new PaymentProviderError('Pago con un formato inesperado');
  }
  const metadataPlan = payment.metadata?.plan_code;
  const itemPlan = payment.additional_info?.items?.[0]?.id;
  const planCode =
    typeof metadataPlan === 'string'
      ? metadataPlan
      : typeof itemPlan === 'string'
        ? itemPlan
        : null;
  return {
    providerPaymentId: String(payment.id),
    externalReference: payment.external_reference ?? null,
    status,
    amount: payment.transaction_amount.toFixed(2),
    currency: payment.currency_id,
    planCode: planCode?.toUpperCase() ?? null,
    approvedAt: payment.date_approved ? new Date(payment.date_approved) : null,
  };
}

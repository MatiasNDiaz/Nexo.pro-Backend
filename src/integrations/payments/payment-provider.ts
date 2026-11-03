/**
 * Contrato con el proveedor de pagos (ADR 0026). El dominio no conoce a Mercado Pago: crea un
 * checkout, recibe avisos firmados y consulta el estado real de cada pago.
 */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/** Estados normalizados del proveedor (los mismos que `payment_status`, sin CREATED). */
export type ProviderPaymentStatus =
  'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'REFUNDED' | 'CHARGED_BACK';

export interface CheckoutInput {
  /** Nuestro id de pago: viaja como `external_reference`. */
  paymentId: string;
  title: string;
  planCode: string;
  /** Importe con dos decimales, como texto (sin errores de coma flotante). */
  amount: string;
  currency: string;
  notificationUrl: string;
  returnUrl: string;
}

export interface CheckoutSession {
  preferenceId: string;
  checkoutUrl: string;
}

/** Lo que informa el proveedor sobre un pago. Nunca se toma del cuerpo del aviso. */
export interface ProviderPayment {
  providerPaymentId: string;
  externalReference: string | null;
  status: ProviderPaymentStatus;
  amount: string;
  currency: string;
  planCode: string | null;
  approvedAt: Date | null;
}

export interface PaymentWebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  rawBody: Buffer;
}

/** Aviso validado: solo dice qué pago cambió. */
export interface PaymentNotice {
  eventId: string;
  eventType: string;
  /** null si el aviso no es de un pago (se ignora). */
  providerPaymentId: string | null;
}

export class InvalidPaymentSignatureError extends Error {
  constructor() {
    super('Firma del aviso de pago inválida');
  }
}

export class PaymentProviderError extends Error {}

export interface PaymentProvider {
  readonly name: 'MERCADOPAGO';
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  fetchPayment(providerPaymentId: string): Promise<ProviderPayment>;
  /** Valida la firma y devuelve el aviso, o rechaza con InvalidPaymentSignatureError. */
  parseWebhook(request: PaymentWebhookRequest): PaymentNotice;
}

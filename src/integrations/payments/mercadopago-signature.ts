import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  InvalidPaymentSignatureError,
  type PaymentNotice,
  type PaymentWebhookRequest,
} from './payment-provider';

const header = (request: PaymentWebhookRequest, name: string): string | null => {
  const value = request.headers[name];
  return typeof value === 'string' ? value : null;
};

/** Firma de Mercado Pago: HMAC-SHA256 de `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`. */
export function mercadoPagoSignature(
  secret: string,
  dataId: string,
  requestId: string,
  ts: string,
): string {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  return createHmac('sha256', secret).update(manifest).digest('hex');
}

/**
 * Lee un aviso de Mercado Pago. Los que no son de pagos (p. ej. `merchant_order`) se devuelven sin
 * id de pago y no se procesan; los de pagos exigen la firma `x-signature` válida. El cuerpo solo
 * aporta el id del aviso: el estado se consulta después a la API.
 */
export function parseMercadoPagoWebhook(
  secret: string,
  request: PaymentWebhookRequest,
): PaymentNotice {
  let body: { id?: unknown; type?: unknown; action?: unknown; data?: { id?: unknown } } = {};
  try {
    const text = request.rawBody.toString('utf8');
    if (text.trim()) body = JSON.parse(text) as typeof body;
  } catch {
    throw new InvalidPaymentSignatureError();
  }
  const text = (value: unknown) =>
    typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  const type = text(request.query.type ?? request.query.topic) || text(body.type);
  const rawId = text(request.query['data.id']) || text(body.data?.id);
  if (type !== 'payment') {
    return { eventId: '', eventType: type || 'unknown', providerPaymentId: null };
  }
  // Mercado Pago pide pasar a minúsculas los ids alfanuméricos al armar la firma.
  const dataId = /^[a-z0-9]+$/i.test(rawId) ? rawId.toLowerCase() : rawId;
  const requestId = header(request, 'x-request-id');
  const parts = Object.fromEntries(
    (header(request, 'x-signature') ?? '').split(',').map((part) => {
      const [key, ...value] = part.split('=');
      return [key.trim(), value.join('=').trim()];
    }),
  ) as Record<string, string | undefined>;
  if (!dataId || !requestId || !parts.ts || !parts.v1 || !/^[0-9a-f]{64}$/i.test(parts.v1)) {
    throw new InvalidPaymentSignatureError();
  }
  const expected = Buffer.from(mercadoPagoSignature(secret, dataId, requestId, parts.ts), 'hex');
  const received = Buffer.from(parts.v1, 'hex');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new InvalidPaymentSignatureError();
  }
  const eventId =
    typeof body.id === 'string' || typeof body.id === 'number'
      ? String(body.id)
      : `${dataId}:${requestId}`;
  const action = typeof body.action === 'string' ? body.action : 'payment';
  return {
    eventId: eventId.slice(0, 100),
    eventType: action.slice(0, 60),
    providerPaymentId: rawId,
  };
}

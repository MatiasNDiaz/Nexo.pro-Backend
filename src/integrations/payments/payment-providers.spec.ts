import { FakePaymentProvider } from './fake-payment.provider';
import { mercadoPagoSignature, parseMercadoPagoWebhook } from './mercadopago-signature';
import { MercadoPagoProvider, toProviderPayment } from './mercadopago.provider';
import { InvalidPaymentSignatureError, PaymentProviderError } from './payment-provider';

const SECRET = 's'.repeat(40);

const signed = (dataId: string, overrides: { secret?: string; ts?: string } = {}) => {
  const ts = overrides.ts ?? '1700000000';
  const v1 = mercadoPagoSignature(overrides.secret ?? SECRET, dataId.toLowerCase(), 'req-1', ts);
  return {
    headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'req-1' },
    query: { 'data.id': dataId, type: 'payment' },
    rawBody: Buffer.from(JSON.stringify({ id: 555, action: 'payment.updated', type: 'payment' })),
  };
};

describe('firma de los avisos de Mercado Pago', () => {
  it('acepta un aviso bien firmado y devuelve solo el id del pago', () => {
    expect(parseMercadoPagoWebhook(SECRET, signed('123456'))).toEqual({
      eventId: '555',
      eventType: 'payment.updated',
      providerPaymentId: '123456',
    });
  });

  it('rechaza firma de otra clave, sin firma o con el id cambiado', () => {
    expect(() => parseMercadoPagoWebhook(SECRET, signed('1', { secret: 'x'.repeat(40) }))).toThrow(
      InvalidPaymentSignatureError,
    );
    const request = signed('123456');
    expect(() =>
      parseMercadoPagoWebhook(SECRET, {
        ...request,
        query: { ...request.query, 'data.id': '999' },
      }),
    ).toThrow(InvalidPaymentSignatureError);
    expect(() =>
      parseMercadoPagoWebhook(SECRET, { ...request, headers: { 'x-request-id': 'req-1' } }),
    ).toThrow(InvalidPaymentSignatureError);
  });

  it('los avisos que no son de pagos se ignoran sin procesar', () => {
    expect(
      parseMercadoPagoWebhook(SECRET, {
        headers: {},
        query: { topic: 'merchant_order', id: '1' },
        rawBody: Buffer.alloc(0),
      }),
    ).toMatchObject({ providerPaymentId: null });
  });
});

describe('MercadoPagoProvider (fetch, sin SDK)', () => {
  const mpPayment = {
    id: 987,
    status: 'approved',
    transaction_amount: 15000,
    currency_id: 'ARS',
    external_reference: '6b0f9a43-5a3c-4c7f-9a4b-0e1d2c3b4a59',
    date_approved: '2026-11-03T10:00:00.000-03:00',
    metadata: { plan_code: 'medium' },
  };

  it('crea la preferencia con el importe del pago, la referencia y la clave de idempotencia', async () => {
    const fetchFn = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'pref-1', init_point: 'https://mp/checkout' }), {
        status: 201,
      }),
    );
    const provider = new MercadoPagoProvider('token-'.repeat(5), SECRET, fetchFn);
    const session = await provider.createCheckout({
      paymentId: 'pay-1',
      title: 'Plan',
      planCode: 'MEDIUM',
      amount: '15000.00',
      currency: 'ARS',
      notificationUrl: 'https://api.example.com/api/v1/webhooks/payments',
      returnUrl: 'https://app.example.com/suscripcion/resultado',
    });
    expect(session).toEqual({ preferenceId: 'pref-1', checkoutUrl: 'https://mp/checkout' });
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.mercadopago.com/checkout/preferences');
    expect(init.headers).toMatchObject({ 'X-Idempotency-Key': 'pay-1' });
    expect(JSON.parse(init.body as string)).toMatchObject({
      external_reference: 'pay-1',
      items: [{ id: 'MEDIUM', unit_price: 15000, currency_id: 'ARS', quantity: 1 }],
      auto_return: 'approved',
    });
  });

  it('normaliza el pago consultado', async () => {
    const fetchFn = jest.fn().mockResolvedValue(new Response(JSON.stringify(mpPayment)));
    const provider = new MercadoPagoProvider('token-'.repeat(5), SECRET, fetchFn);
    await expect(provider.fetchPayment('987')).resolves.toMatchObject({
      providerPaymentId: '987',
      status: 'APPROVED',
      amount: '15000.00',
      currency: 'ARS',
      planCode: 'MEDIUM',
      externalReference: mpPayment.external_reference,
    });
  });

  it('mapea reembolsos y contracargos, y rechaza estados desconocidos', () => {
    expect(toProviderPayment({ ...mpPayment, status: 'refunded' }).status).toBe('REFUNDED');
    expect(toProviderPayment({ ...mpPayment, status: 'charged_back' }).status).toBe('CHARGED_BACK');
    expect(toProviderPayment({ ...mpPayment, status: 'in_process' }).status).toBe('PENDING');
    expect(() => toProviderPayment({ ...mpPayment, status: 'raro' })).toThrow(PaymentProviderError);
  });

  it('un error de Mercado Pago o un id raro no se confunden con un pago', async () => {
    const fetchFn = jest.fn().mockResolvedValue(new Response('{}', { status: 500 }));
    const provider = new MercadoPagoProvider('token-'.repeat(5), SECRET, fetchFn);
    await expect(provider.fetchPayment('987')).rejects.toThrow(PaymentProviderError);
    await expect(provider.fetchPayment('../users')).rejects.toThrow(PaymentProviderError);
  });
});

describe('FakePaymentProvider', () => {
  it('firma sus avisos igual que Mercado Pago', async () => {
    const fake = new FakePaymentProvider(SECRET);
    await fake.createCheckout({
      paymentId: 'pay-1',
      title: 'Plan',
      planCode: 'BASIC',
      amount: '10000.00',
      currency: 'ARS',
      notificationUrl: '',
      returnUrl: '',
    });
    const id = fake.pay('pay-1');
    expect(fake.parseWebhook(fake.buildSignedWebhook(id)).providerPaymentId).toBe(id);
    await expect(fake.fetchPayment(id)).resolves.toMatchObject({
      status: 'APPROVED',
      amount: '10000.00',
      planCode: 'BASIC',
    });
  });
});

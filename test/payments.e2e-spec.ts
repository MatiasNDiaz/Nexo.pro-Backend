import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AdminAuditLog } from '../src/audit/entities/admin-audit-log.entity';
import type { FakePaymentProvider } from '../src/integrations/payments/fake-payment.provider';
import {
  PAYMENT_PROVIDER,
  type PaymentWebhookRequest,
} from '../src/integrations/payments/payment-provider';
import { Notification, NotificationType } from '../src/notifications/entities/notification.entity';
import { Payment, PaymentStatus } from '../src/payments/entities/payment.entity';
import { PaymentsService } from '../src/payments/payments.service';
import { ProfessionalMedia } from '../src/professionals/entities/professional-media.entity';
import { ProfessionalProfession } from '../src/professionals/entities/professional-profession.entity';
import {
  Subscription,
  SubscriptionHistory,
  SubscriptionStatus,
} from '../src/subscriptions/entities/subscription.entity';
import { type Client, signInAdmin, signInProfessional } from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';
import { fakeMp4, PNG_BYTES, uploadFile } from './utils/uploads';

const DAY = 24 * 60 * 60 * 1000;

describe('Pagos con Mercado Pago (e2e, proveedor simulado, ADR 0026)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let fake: FakePaymentProvider;
  let admin: { client: Client; id: string };

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    fake = app.get<FakePaymentProvider>(PAYMENT_PROVIDER);
    const signed = await signInAdmin(app);
    const me = await signed.client.get('/auth/me');
    admin = { client: signed.client, id: (me.body as { id: string }).id };
  });

  afterAll(async () => {
    await app.close();
  });

  /** Manda por HTTP un aviso firmado, como Mercado Pago. */
  const send = (hook: PaymentWebhookRequest) =>
    request(app.getHttpServer())
      .post('/api/v1/webhooks/payments')
      .query(hook.query as Record<string, string>)
      .set('Content-Type', 'application/json')
      .set(hook.headers as Record<string, string>)
      .send(hook.rawBody.toString());

  const notify = (providerPaymentId: string) => send(fake.buildSignedWebhook(providerPaymentId));

  const subscriptionOf = (userId: string) =>
    dataSource.getRepository(Subscription).findOneByOrFail({ userId });
  const paymentRow = (id: string) => dataSource.getRepository(Payment).findOneByOrFail({ id });
  const historyOf = async (userId: string) =>
    (
      await dataSource.getRepository(SubscriptionHistory).find({
        where: { subscriptionId: (await subscriptionOf(userId)).id },
        order: { createdAt: 'ASC' },
      })
    ).map((h) => h.event);
  const planCodeOf = async (userId: string) =>
    ((await (await signedSummary(userId)).body) as { plan: { code: string } }).plan.code;
  const clients = new Map<string, Client>();
  const signedSummary = (userId: string) => clients.get(userId)!.get('/subscriptions/me');
  const adminAlerts = () =>
    dataSource
      .getRepository(Notification)
      .countBy({ userId: admin.id, type: NotificationType.PAYMENT_ALERT });

  async function professional() {
    const pro = await signInProfessional(app);
    clients.set(pro.id, pro.client);
    return pro;
  }

  async function checkout(client: Client, planCode: string) {
    const res = await client.post('/subscriptions/checkout', { planCode });
    expect(res.status).toBe(201);
    return res.body as { paymentId: string; purpose: string; amount: string; checkoutUrl: string };
  }

  /** Paga el checkout y Mercado Pago avisa. Devuelve el id de Mercado Pago. */
  async function payAndNotify(paymentId: string) {
    const providerId = fake.pay(paymentId);
    const res = await notify(providerId);
    expect(res.status).toBe(200);
    return providerId;
  }

  it('durante la prueba muestra los tres planes con el mes completo', async () => {
    const { client } = await professional();
    const res = await client.get('/subscriptions/plans');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        code: 'BASIC',
        current: true,
        available: true,
        amount: '10000.00',
      }),
      expect.objectContaining({ code: 'MEDIUM', available: true, purpose: 'SUBSCRIPTION' }),
      expect.objectContaining({ code: 'PREMIUM', available: true, amount: '20000.00' }),
    ]);
  });

  it('pagar en la prueba activa el plan ya y no pierde días; el aviso repetido se procesa una vez', async () => {
    const { client, id } = await professional();
    const trialEndsAt = (await subscriptionOf(id)).trialEndsAt!;
    const created = await checkout(client, 'premium');
    expect(created).toMatchObject({ purpose: 'SUBSCRIPTION', amount: '20000.00' });
    expect(created.checkoutUrl).toMatch(/^https:\/\/fake-mercadopago\.local\//);

    const providerId = fake.pay(created.paymentId);
    const hook = fake.buildSignedWebhook(providerId);
    expect((await send(hook)).body).toEqual({ received: true, outcome: 'PROCESSED' });
    expect((await send(hook)).body).toEqual({ received: true, outcome: 'DUPLICATE' });
    // Otro aviso del mismo pago (id distinto): no lo aplica de nuevo.
    expect((await notify(providerId)).status).toBe(200);

    const subscription = await subscriptionOf(id);
    expect(subscription).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      periodAmountPaid: '20000.00',
    });
    expect(subscription.currentPeriodEnd!.getTime()).toBe(trialEndsAt.getTime() + 30 * DAY);
    expect(await planCodeOf(id)).toBe('PREMIUM');
    expect(await historyOf(id)).toEqual(['TRIAL_STARTED', 'PAYMENT_APPROVED']);
    expect(await paymentRow(created.paymentId)).toMatchObject({
      status: PaymentStatus.APPROVED,
      providerPaymentId: providerId,
      grantedFrom: trialEndsAt,
      grantedUntil: subscription.currentPeriodEnd,
    });
    expect(
      await dataSource
        .getRepository(Notification)
        .countBy({ userId: id, type: NotificationType.SUBSCRIPTION_UPDATED }),
    ).toBe(1);

    const mine = await client.get('/subscriptions/me/payments');
    expect(mine.body).toEqual([
      expect.objectContaining({ id: created.paymentId, applied: true, planCode: 'PREMIUM' }),
    ]);
  });

  it('rechaza avisos sin firma válida e ignora los que no son de pagos', async () => {
    const { client, id } = await professional();
    const created = await checkout(client, 'BASIC');
    const providerId = fake.pay(created.paymentId);
    const hook = fake.buildSignedWebhook(providerId);
    const forged = await send({
      ...hook,
      headers: { ...hook.headers, 'x-signature': 'ts=1,v1=' + '0'.repeat(64) },
    });
    expect(forged.status).toBe(401);
    expect((await subscriptionOf(id)).status).toBe(SubscriptionStatus.TRIAL);

    const other = await send({
      headers: {},
      query: { topic: 'merchant_order', id: '1' },
      rawBody: Buffer.from('{}'),
    });
    expect(other.body).toEqual({ received: true, outcome: 'IGNORED' });
  });

  it('un intento rechazado y después aprobado del mismo checkout aplica una sola vez', async () => {
    const { client, id } = await professional();
    const created = await checkout(client, 'BASIC');
    const rejected = fake.pay(created.paymentId, 'REJECTED');
    await notify(rejected);
    expect((await paymentRow(created.paymentId)).status).toBe(PaymentStatus.REJECTED);
    expect((await subscriptionOf(id)).status).toBe(SubscriptionStatus.TRIAL);

    await payAndNotify(created.paymentId);
    expect((await subscriptionOf(id)).status).toBe(SubscriptionStatus.ACTIVE);
  });

  it('control 1: si el monto, la moneda o el plan no coinciden, no se aplica, se audita y avisa', async () => {
    const { client, id } = await professional();
    const created = await checkout(client, 'MEDIUM');
    const alertsBefore = await adminAlerts();
    const providerId = fake.pay(created.paymentId, 'APPROVED', { amount: '1.00' });
    expect((await notify(providerId)).status).toBe(200);

    expect(await paymentRow(created.paymentId)).toMatchObject({
      status: PaymentStatus.APPROVED,
      appliedAt: null,
    });
    expect((await subscriptionOf(id)).status).toBe(SubscriptionStatus.TRIAL);
    expect(await planCodeOf(id)).toBe('BASIC');
    const audit = await dataSource
      .getRepository(AdminAuditLog)
      .findOneByOrFail({ action: 'PAYMENT_MISMATCH', targetId: created.paymentId });
    expect(audit.metadata).toMatchObject({ expectedAmount: '15000.00', receivedAmount: '1.00' });
    expect(await adminAlerts()).toBe(alertsBefore + 1);

    // Un aviso posterior del mismo pago no lo aplica ni vuelve a alertar.
    await notify(providerId);
    expect(await adminAlerts()).toBe(alertsBefore + 1);

    const list = await admin.client.get(`/admin/payments?userId=${id}`);
    expect(list.body.data).toEqual([
      expect.objectContaining({ id: created.paymentId, needsReview: true }),
    ]);

    const otherPlan = await checkout(client, 'MEDIUM');
    await notify(fake.pay(otherPlan.paymentId, 'APPROVED', { planCode: 'PREMIUM' }));
    expect((await paymentRow(otherPlan.paymentId)).appliedAt).toBeNull();
  });

  it('control 2: un reembolso revierte el período, queda en el historial y avisa al admin', async () => {
    const { client, id } = await professional();
    const created = await checkout(client, 'PREMIUM');
    const providerId = await payAndNotify(created.paymentId);
    expect(await planCodeOf(id)).toBe('PREMIUM');
    const alertsBefore = await adminAlerts();

    fake.setStatus(providerId, 'REFUNDED');
    expect((await notify(providerId)).status).toBe(200);

    expect(await subscriptionOf(id)).toMatchObject({
      status: SubscriptionStatus.TRIAL,
      currentPeriodEnd: null,
      periodAmountPaid: null,
    });
    expect(await planCodeOf(id)).toBe('BASIC');
    const payment = await paymentRow(created.paymentId);
    expect(payment.status).toBe(PaymentStatus.REFUNDED);
    expect(payment.revertedAt).not.toBeNull();
    expect(await historyOf(id)).toEqual(['TRIAL_STARTED', 'PAYMENT_APPROVED', 'PAYMENT_REVERTED']);
    expect(
      await dataSource
        .getRepository(AdminAuditLog)
        .countBy({ action: 'PAYMENT_REVERTED', targetId: created.paymentId }),
    ).toBe(1);
    expect(await adminAlerts()).toBe(alertsBefore + 1);

    // Repetido: no revierte dos veces.
    await notify(providerId);
    expect(await historyOf(id)).toHaveLength(3);
  });

  it('un contracargo de una renovación corre el vencimiento 30 días para atrás', async () => {
    const { client, id } = await professional();
    await payAndNotify((await checkout(client, 'BASIC')).paymentId);
    const end = (await subscriptionOf(id)).currentPeriodEnd!;

    // Renovación anticipada (ventana de 7 días): se crea con la fecha simulada.
    const payments = app.get(PaymentsService);
    const renewal = await payments.checkout(id, 'BASIC', new Date(end.getTime() - 3 * DAY));
    const providerId = await payAndNotify(renewal.paymentId);
    expect((await subscriptionOf(id)).currentPeriodEnd!.getTime()).toBe(end.getTime() + 30 * DAY);
    expect(await historyOf(id)).toContain('RENEWED');

    fake.setStatus(providerId, 'CHARGED_BACK');
    await notify(providerId);
    expect(await subscriptionOf(id)).toMatchObject({ status: SubscriptionStatus.ACTIVE });
    expect((await subscriptionOf(id)).currentPeriodEnd!.getTime()).toBe(end.getTime());
    expect((await paymentRow(renewal.paymentId)).status).toBe(PaymentStatus.CHARGED_BACK);
  });

  it('renovar recién desde 7 días antes; subir dentro de los 10 días paga la diferencia', async () => {
    const { client, id } = await professional();
    await payAndNotify((await checkout(client, 'BASIC')).paymentId);

    const early = await client.post('/subscriptions/checkout', { planCode: 'BASIC' });
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('RENEWAL_NOT_YET');

    const upgrade = await checkout(client, 'PREMIUM');
    expect(upgrade).toMatchObject({ purpose: 'UPGRADE_DIFFERENCE', amount: '10000.00' });
    const end = (await subscriptionOf(id)).currentPeriodEnd;
    await payAndNotify(upgrade.paymentId);
    expect(await planCodeOf(id)).toBe('PREMIUM');
    expect(await subscriptionOf(id)).toMatchObject({
      currentPeriodEnd: end,
      periodAmountPaid: '20000.00',
    });
    expect(await historyOf(id)).toEqual(['TRIAL_STARTED', 'PAYMENT_APPROVED', 'UPGRADED']);
  });

  it('el admin cambia el plan de común acuerdo, con motivo, historial y auditoría', async () => {
    const { id } = await professional();
    const path = `/admin/subscriptions/${id}/plan`;
    expect((await admin.client.post(path, { planCode: 'MEDIUM', reason: 'corto' })).status).toBe(
      400,
    );
    const res = await admin.client.post(path, {
      planCode: 'MEDIUM',
      reason: 'Acordado por soporte con el profesional',
    });
    expect(res.status).toBe(204);
    expect(await planCodeOf(id)).toBe('MEDIUM');
    expect(await historyOf(id)).toEqual(['TRIAL_STARTED', 'ADMIN_CHANGE']);
    expect(
      await dataSource
        .getRepository(AdminAuditLog)
        .countBy({ action: 'SUBSCRIPTION_PLAN_CHANGED', targetId: id }),
    ).toBe(1);
    expect(
      (
        await admin.client.post(path, {
          planCode: 'MEDIUM',
          reason: 'Acordado por soporte con el profesional',
        })
      ).body.code,
    ).toBe('SAME_PLAN');
    // El profesional no puede usar las rutas del admin.
    expect(
      (await clients.get(id)!.post(path, { planCode: 'PREMIUM', reason: 'x'.repeat(12) })).status,
    ).toBe(403);
  });

  // Último: la tarea corre con una fecha futura sobre todas las suscripciones pagas.
  it('bajar de plan al renovar: al empezar el período oculta lo que excede, sin borrar; después vence', async () => {
    const { client, id } = await professional();
    await payAndNotify((await checkout(client, 'PREMIUM')).paymentId);

    // Contenido de Premium: 2 profesiones, un video y un banner con imagen.
    const professions = (await client.get('/professions')).body as Array<{ id: string }>;
    const [primary, second] = professions.map((p) => p.id);
    expect(
      (
        await client.put('/professionals/me/professions', {
          professionIds: [primary, second],
          primaryId: primary,
        })
      ).status,
    ).toBe(200);
    const video = await uploadFile(client, fakeMp4(10_000), {
      purpose: 'PROFILE_MEDIA',
      kind: 'VIDEO',
      filename: 'clip.mp4',
      contentType: 'video/mp4',
    });
    expect(
      (await client.post('/professionals/me/media', { fileId: video, purpose: 'PROFILE_VIDEO' }))
        .status,
    ).toBe(201);
    const image = () => uploadFile(client, PNG_BYTES, { purpose: 'PROFILE_MEDIA', kind: 'IMAGE' });
    expect(
      (await client.post('/professionals/me/media', { fileId: await image(), purpose: 'BANNER' }))
        .status,
    ).toBe(201);
    const work = await client.post('/professionals/me/media', {
      fileId: await image(),
      purpose: 'WORK',
    });

    // Elige Basic para el mes siguiente (ventana de 7 días).
    const end = (await subscriptionOf(id)).currentPeriodEnd!;
    const payments = app.get(PaymentsService);
    const renewal = await payments.checkout(id, 'BASIC', new Date(end.getTime() - 2 * DAY));
    await payAndNotify(renewal.paymentId);
    expect(await planCodeOf(id)).toBe('PREMIUM');

    await payments.refreshDue(new Date(end.getTime() + 60 * 1000));
    expect(await planCodeOf(id)).toBe('BASIC');
    expect(await historyOf(id)).toEqual([
      'TRIAL_STARTED',
      'PAYMENT_APPROVED',
      'RENEWED',
      'DOWNGRADED',
    ]);
    const profile = (await client.get('/professionals/me')).body as {
      id: string;
      media: Array<{ id: string; purpose: string; status: string }>;
      professions: Array<{ id: string; status: string }>;
    };
    expect(profile.professions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: primary, status: 'ACTIVE' }),
        expect.objectContaining({ id: second, status: 'HIDDEN_BY_PLAN' }),
      ]),
    );
    const statusOf = (purpose: string) => profile.media.find((m) => m.purpose === purpose)?.status;
    expect(statusOf('PROFILE_VIDEO')).toBe('HIDDEN_BY_PLAN');
    expect(statusOf('BANNER')).toBe('HIDDEN_BY_PLAN');
    expect(statusOf('WORK')).toBe('ACTIVE');
    // Nada se borró.
    expect(
      await dataSource.getRepository(ProfessionalMedia).countBy({ professionalId: profile.id }),
    ).toBe(3);
    expect(
      await dataSource
        .getRepository(ProfessionalProfession)
        .countBy({ professionalId: profile.id }),
    ).toBe(2);

    // Elegir qué mostrar: dentro del límite del plan.
    const tooMany = await client.put('/professionals/me/professions/visible', {
      professionIds: [primary, second],
    });
    expect(tooMany.body.code).toBe('PLAN_LIMIT_REACHED');
    const videoItem = profile.media.find((m) => m.purpose === 'PROFILE_VIDEO')!;
    expect(
      (await client.put('/professionals/me/media/visible', { ids: [videoItem.id] })).body.code,
    ).toBe('PLAN_LIMIT_REACHED');
    const chosen = await client.put('/professionals/me/media/visible', {
      ids: [(work.body as { id: string }).id],
    });
    expect(chosen.status).toBe(200);

    // Sin renovar, vence: la tarea lo marca y queda en el historial.
    await payments.refreshDue(new Date(end.getTime() + 31 * DAY));
    expect((await subscriptionOf(id)).status).toBe(SubscriptionStatus.EXPIRED);
    expect((await historyOf(id)).at(-1)).toBe('EXPIRED');
  });
});

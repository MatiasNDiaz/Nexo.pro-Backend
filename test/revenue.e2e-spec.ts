import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AdminAuditLog } from '../src/audit/entities/admin-audit-log.entity';
import type { FakePaymentProvider } from '../src/integrations/payments/fake-payment.provider';
import { PAYMENT_PROVIDER } from '../src/integrations/payments/payment-provider';
import { Payment, PaymentKind } from '../src/payments/entities/payment.entity';
import { PaymentsService } from '../src/payments/payments.service';
import { type Client, signInAdmin, signInCustomer, signInProfessional } from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';

const DAY = 24 * 60 * 60 * 1000;

interface Totals {
  gross: string;
  refunds: string;
  chargebacks: string;
  net: string;
  payments: number;
  returns: number;
  byPlan: Array<{ planCode: string; gross: string; net: string }>;
}

/**
 * Panel de ingresos (ADR 0030). Los profesionales y clientes del escenario trabajan o viven en una
 * localidad creada para este test: filtrando por ella, los números no dependen de los otros tests.
 */
describe('Panel de ingresos (e2e, ADR 0030)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let fake: FakePaymentProvider;
  let admin: Client;
  let adminEmail: string;
  let localityId: string;
  let otherLocalityName: string;
  const localityName = `Zona Test ${randomUUID().slice(0, 6)}`;
  const people: Record<string, { id: string; email: string; client: Client }> = {};
  const paymentIds: Record<string, string> = {};

  const notify = (providerPaymentId: string) => {
    const hook = fake.buildSignedWebhook(providerPaymentId);
    return request(app.getHttpServer())
      .post('/api/v1/webhooks/payments')
      .query(hook.query as Record<string, string>)
      .set('Content-Type', 'application/json')
      .set(hook.headers as Record<string, string>)
      .send(hook.rawBody.toString());
  };

  async function checkout(client: Client, planCode: string) {
    const res = await client.post('/subscriptions/checkout', { planCode });
    expect(res.status).toBe(201);
    return (res.body as { paymentId: string }).paymentId;
  }

  async function pay(paymentId: string) {
    const providerId = fake.pay(paymentId);
    expect((await notify(providerId)).status).toBe(200);
    return providerId;
  }

  /** Mueve todas las zonas del profesional a la localidad del test (y opcionalmente suma otra). */
  async function workIn(userId: string, alsoIn?: string) {
    const [{ id: profileId }] = await dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM professional_profiles WHERE user_id = $1`,
      [userId],
    );
    await dataSource.query(
      `UPDATE professional_service_areas SET locality_id = $1 WHERE professional_id = $2`,
      [localityId, profileId],
    );
    if (alsoIn) {
      await dataSource.query(
        `INSERT INTO professional_service_areas (professional_id, locality_id) VALUES ($1, $2)`,
        [profileId, alsoIn],
      );
    }
  }

  async function professional(key: string, alsoIn?: string) {
    const pro = await signInProfessional(app);
    await workIn(pro.id, alsoIn);
    people[key] = pro;
    return pro;
  }

  const planId = async (code: string) =>
    (
      await dataSource.query<Array<{ id: string }>>(
        `SELECT id FROM subscription_plans WHERE code = $1`,
        [code],
      )
    )[0].id;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    fake = app.get<FakePaymentProvider>(PAYMENT_PROVIDER);
    const signed = await signInAdmin(app);
    admin = signed.client;
    adminEmail = signed.admin.email;

    const [cordoba] = await dataSource.query<
      Array<{ id: string; province_id: string; name: string }>
    >(
      `SELECT l.id, l.province_id, l.name FROM localities l
         JOIN provinces p ON p.id = l.province_id
        WHERE p.name = 'Córdoba' ORDER BY l.name LIMIT 1`,
    );
    otherLocalityName = cordoba.name;
    [{ id: localityId }] = await dataSource.query<Array<{ id: string }>>(
      `INSERT INTO localities (province_id, name) VALUES ($1, $2) RETURNING id`,
      [cordoba.province_id, localityName],
    );

    // A: Premium pagado. B: Basic pagado y reembolsado (trabaja también en otra localidad).
    // C: Medium pagado el mes pasado. E: checkout sin pagar.
    const a = await professional('A');
    paymentIds.A = await checkout(a.client, 'PREMIUM');
    await pay(paymentIds.A);

    const b = await professional('B', cordoba.id);
    paymentIds.B = await checkout(b.client, 'BASIC');
    const refunded = await pay(paymentIds.B);
    fake.setStatus(refunded, 'REFUNDED');
    expect((await notify(refunded)).status).toBe(200);

    const c = await professional('C');
    paymentIds.C = await checkout(c.client, 'MEDIUM');
    await pay(paymentIds.C);
    await dataSource.query(
      `UPDATE payments SET approved_at = approved_at - interval '1 month' WHERE id = $1`,
      [paymentIds.C],
    );

    const e = await professional('E');
    paymentIds.E = await checkout(e.client, 'BASIC');

    // Clientes: X vive en la localidad del test; Y además se dio de baja.
    const [{ id: neighborhoodId }] = await dataSource.query<Array<{ id: string }>>(
      `INSERT INTO neighborhoods (locality_id, name, normalized_name, status)
       VALUES ($1, 'Centro', 'centro', 'APPROVED') RETURNING id`,
      [localityId],
    );
    for (const key of ['X', 'Y']) {
      const customer = await signInCustomer(app);
      await dataSource.query(`UPDATE users SET neighborhood_id = $1 WHERE id = $2`, [
        neighborhoodId,
        customer.id,
      ]);
      people[key] = customer;
    }
    await dataSource.query(`UPDATE users SET deleted_at = now() WHERE id = $1`, [people.Y.id]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('cada pago guarda su tipo al aplicarse: nuevo, mejora, renovación y reactivación', async () => {
    const repo = dataSource.getRepository(Payment);
    expect((await repo.findOneByOrFail({ id: paymentIds.A })).kind).toBe(PaymentKind.NEW);

    // Mejora dentro de los 10 días y renovación anticipada (fecha simulada).
    const pro = await signInProfessional(app);
    await pay(await checkout(pro.client, 'BASIC'));
    const upgrade = await checkout(pro.client, 'PREMIUM');
    await pay(upgrade);
    expect((await repo.findOneByOrFail({ id: upgrade })).kind).toBe(PaymentKind.UPGRADE);
    const end = (
      await dataSource.query<Array<{ end: Date }>>(
        `SELECT current_period_end AS end FROM subscriptions WHERE user_id = $1`,
        [pro.id],
      )
    )[0].end;
    const renewal = await app
      .get(PaymentsService)
      .checkout(pro.id, 'PREMIUM', new Date(end.getTime() - 3 * DAY));
    await pay(renewal.paymentId);
    expect((await repo.findOneByOrFail({ id: renewal.paymentId })).kind).toBe(PaymentKind.RENEWAL);

    // Pagó, se le venció (se corre todo 70 días para atrás) y volvió a pagar.
    const back = await signInProfessional(app);
    const first = await checkout(back.client, 'BASIC');
    await pay(first);
    await dataSource.query(
      `UPDATE payments SET applied_at = applied_at - interval '70 days',
              approved_at = approved_at - interval '70 days',
              granted_from = granted_from - interval '70 days',
              granted_until = granted_until - interval '70 days'
        WHERE id = $1`,
      [first],
    );
    await dataSource.query(
      `UPDATE subscriptions SET trial_ends_at = trial_ends_at - interval '70 days',
              current_period_start = current_period_start - interval '70 days',
              current_period_end = current_period_end - interval '70 days'
        WHERE user_id = $1`,
      [back.id],
    );
    const again = await checkout(back.client, 'BASIC');
    await pay(again);
    expect((await repo.findOneByOrFail({ id: again })).kind).toBe(PaymentKind.REACTIVATION);
  });

  it('un reembolso guarda la fecha de devolución; el pago sin aplicar queda sin tipo', async () => {
    const b = await dataSource.getRepository(Payment).findOneByOrFail({ id: paymentIds.B });
    expect(b.status).toBe('REFUNDED');
    expect(b.moneyReturnedAt).not.toBeNull();
    expect(b.kind).toBe(PaymentKind.NEW);
    const e = await dataSource.getRepository(Payment).findOneByOrFail({ id: paymentIds.E });
    expect(e).toMatchObject({ kind: null, moneyReturnedAt: null });
  });

  it('lista de pagos: quién pagó, plan, tipo y estado; por defecto solo los que movieron plata', async () => {
    const res = await admin.get(`/admin/revenue/payments?localityId=${localityId}`);
    expect(res.status).toBe(200);
    const body = res.body as {
      total: number;
      data: Array<{
        id: string;
        kind: string | null;
        status: string;
        amount: string;
        planCode: string;
        moneyReturnedAt: string | null;
        user: { email: string; role: string; localities: string[] };
      }>;
    };
    expect(body.total).toBe(3);
    const byId = new Map(body.data.map((p) => [p.id, p]));
    expect(byId.get(paymentIds.A)).toMatchObject({
      kind: 'NEW',
      status: 'APPROVED',
      amount: '20000.00',
      planCode: 'PREMIUM',
      user: { email: people.A.email, role: 'PROFESSIONAL', localities: [localityName] },
    });
    expect(byId.get(paymentIds.B)?.status).toBe('REFUNDED');
    expect(byId.get(paymentIds.B)?.moneyReturnedAt).not.toBeNull();
    expect(byId.get(paymentIds.B)?.user.localities).toEqual(
      [localityName, otherLocalityName].sort((x, y) => x.localeCompare(y)),
    );
    // El más reciente primero; C se aprobó el mes pasado.
    expect(body.data.at(-1)?.id).toBe(paymentIds.C);

    const created = await admin.get(
      `/admin/revenue/payments?localityId=${localityId}&status=CREATED`,
    );
    expect((created.body as { data: Array<{ id: string }> }).data.map((p) => p.id)).toEqual([
      paymentIds.E,
    ]);

    const premium = await admin.get(
      `/admin/revenue/payments?localityId=${localityId}&planId=${await planId('PREMIUM')}`,
    );
    expect((premium.body as { total: number }).total).toBe(1);
  });

  it('resumen: neto de reembolsos por fecha, por plan y comparado con el período anterior', async () => {
    const res = await admin.get(`/admin/revenue/summary?localityId=${localityId}`);
    expect(res.status).toBe(200);
    const body = res.body as {
      from: string;
      to: string;
      buckets: Array<Totals & { start: string }>;
      total: Totals;
      previous: Totals & { from: string; to: string };
      change: { net: string; netPercent: number | null };
      localityMayOverlap: boolean;
    };
    expect(body.from.endsWith('-01')).toBe(true);
    expect(body.total).toMatchObject({
      gross: '30000.00',
      refunds: '10000.00',
      chargebacks: '0.00',
      net: '20000.00',
      payments: 2,
      returns: 1,
    });
    expect(body.total.byPlan).toEqual([
      expect.objectContaining({ planCode: 'BASIC', gross: '10000.00', net: '0.00' }),
      expect.objectContaining({ planCode: 'PREMIUM', gross: '20000.00', net: '20000.00' }),
    ]);
    expect(body.previous).toMatchObject({ gross: '15000.00', net: '15000.00', payments: 1 });
    expect(body.change).toEqual({ net: '5000.00', netPercent: 33.3 });
    expect(body.buckets).toHaveLength(1);
    expect(body.buckets[0].net).toBe('20000.00');
    expect(body.localityMayOverlap).toBe(true);

    const premium = await admin.get(
      `/admin/revenue/summary?localityId=${localityId}&planId=${await planId('PREMIUM')}&groupBy=day`,
    );
    const days = premium.body as { buckets: Array<{ net: string }>; total: Totals };
    expect(days.total.net).toBe('20000.00');
    expect(days.buckets.length).toBeGreaterThanOrEqual(1);
  });

  it('registros: quién se registró, con qué rol y si ya pagó alguna vez', async () => {
    const res = await admin.get(`/admin/revenue/registrations?localityId=${localityId}&limit=50`);
    expect(res.status).toBe(200);
    const body = res.body as {
      total: number;
      data: Array<{
        user: { id: string; name: string; email: string | null; role: string; deleted: boolean };
        hasPaid: boolean | null;
        currentPlanCode: string | null;
      }>;
    };
    expect(body.total).toBe(6);
    const byId = new Map(body.data.map((r) => [r.user.id, r]));
    expect(byId.get(people.A.id)).toMatchObject({ hasPaid: true, currentPlanCode: 'PREMIUM' });
    // B pagó pero se le devolvió: no cuenta.
    expect(byId.get(people.B.id)?.hasPaid).toBe(false);
    expect(byId.get(people.E.id)?.hasPaid).toBe(false);
    expect(byId.get(people.X.id)).toMatchObject({ hasPaid: null, user: { role: 'CUSTOMER' } });
    expect(byId.get(people.Y.id)?.user).toMatchObject({
      name: 'Usuario eliminado',
      email: null,
      deleted: true,
    });

    const paid = await admin.get(
      `/admin/revenue/registrations?localityId=${localityId}&hasPaid=true`,
    );
    expect(
      (paid.body as { data: Array<{ user: { id: string } }> }).data.map((r) => r.user.id).sort(),
    ).toEqual([people.A.id, people.C.id].sort());
    const customers = await admin.get(
      `/admin/revenue/registrations?localityId=${localityId}&role=CUSTOMER`,
    );
    expect((customers.body as { total: number }).total).toBe(2);
  });

  it('exporta a CSV para Excel, auditado y sin datos personales en la auditoría', async () => {
    const res = await admin
      .post('/admin/revenue/exports', { report: 'PAYMENTS', localityId })
      .buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => done(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="pagos-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    const csv = (res.body as Buffer).toString('utf8');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[0]).toBe(
      'Fecha y hora;Nombre;Email;Rol;Localidades;Plan;Plan anterior;Tipo;Estado;Monto;Moneda;Fecha de devolución;Id del pago',
    );
    expect(lines).toHaveLength(4);
    expect(lines.find((l) => l.includes(paymentIds.A))).toContain(
      `${people.A.email};Profesional;${localityName};`,
    );
    expect(lines.find((l) => l.includes(paymentIds.A))).toContain(';Nuevo;Aprobado;20000,00;ARS;');
    expect(lines.find((l) => l.includes(paymentIds.B))).toContain(';Reembolsado;10000,00;');

    const registrations = await admin
      .post('/admin/revenue/exports', { report: 'REGISTRATIONS', localityId })
      .buffer(true)
      .parse((r, done) => {
        let text = '';
        r.on('data', (c: Buffer) => (text += c.toString('utf8')));
        r.on('end', () => done(null, text));
      });
    expect(registrations.status).toBe(200);
    // Sin emails (ADR 0030).
    expect(registrations.body as string).not.toContain('@');
    expect(registrations.body as string).toContain('Usuario eliminado');

    const summary = await admin.post('/admin/revenue/exports', { report: 'SUMMARY', localityId });
    expect(summary.status).toBe(200);
    expect(summary.text).toContain('Variación del neto;Todos;;;;5000,00;33,3 %');

    const logs = await dataSource.getRepository(AdminAuditLog).find({
      where: { action: 'REVENUE_EXPORTED' },
      order: { createdAt: 'DESC' },
      take: 3,
    });
    expect(logs.map((l) => l.metadata?.report).sort()).toEqual([
      'PAYMENTS',
      'REGISTRATIONS',
      'SUMMARY',
    ]);
    expect(logs.find((l) => l.metadata?.report === 'PAYMENTS')?.metadata).toMatchObject({
      localityId,
      rows: 3,
    });
    expect(logs.every((l) => /^[0-9a-f]{64}$/.test(l.ipHash ?? ''))).toBe(true);
    expect(JSON.stringify(logs)).not.toContain(people.A.email);
    expect(JSON.stringify(logs)).not.toContain(adminEmail);
  });

  it('solo el admin, con CSRF para exportar, y rangos válidos', async () => {
    const pro = people.A.client;
    expect((await pro.get('/admin/revenue/summary')).status).toBe(403);
    expect((await pro.post('/admin/revenue/exports', { report: 'PAYMENTS' })).status).toBe(403);

    const token = admin.csrfToken;
    admin.csrfToken = '';
    expect((await admin.post('/admin/revenue/exports', { report: 'PAYMENTS' })).status).toBe(403);
    admin.csrfToken = token;

    const inverted = await admin.get('/admin/revenue/payments?from=2026-11-10&to=2026-11-01');
    expect(inverted.body.code).toBe('INVALID_RANGE');
    const tooLong = await admin.get(
      '/admin/revenue/summary?groupBy=day&from=2020-01-01&to=2026-01-01',
    );
    expect(tooLong.body.code).toBe('RANGE_TOO_LONG');
    expect((await admin.get('/admin/revenue/summary?from=2026-02-30')).status).toBe(400);
    expect((await admin.post('/admin/revenue/exports', { report: 'OTRO' })).status).toBe(400);
  });
});

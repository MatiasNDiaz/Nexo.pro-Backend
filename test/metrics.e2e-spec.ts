import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { today } from '../src/common/calendar-periods';
import { purgeOldMetrics } from '../src/metrics/metrics-cleanup.job';
import { Client, signInAdmin, signInCustomer } from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';
import { listedProfessional } from './utils/marketplace';

const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

interface Values {
  profileViewers: number;
  searchAppearances: number;
  firstPlace: number;
  requests: number;
  completed: number;
  ratingCount: number;
  ratingAverage: number | null;
}

/**
 * Métricas Premium (ADR 0033). Los dos profesionales trabajan en una localidad creada para este
 * test: buscando por ella, solo aparecen ellos (A primero por ser Premium).
 */
describe('Métricas Premium (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let admin: Client;
  let localityId: string;
  let a: Awaited<ReturnType<typeof listedProfessional>>;
  let b: Awaited<ReturnType<typeof listedProfessional>>;
  let slugA: string;

  /** Un navegador común (los robots no cuentan), con su propia IP. */
  const browser = (client = new Client(app)) => {
    client.agent.set('User-Agent', CHROME);
    return client;
  };
  const search = (client: Client) => client.get(`/catalog/professionals?localityId=${localityId}`);
  const metricsOf = async (client: Client, path = '/professionals/me/metrics', query = '') => {
    const res = await client.get(`${path}${query}`);
    expect(res.status).toBe(200);
    return res.body as {
      total: Values;
      previous: Values;
      buckets: Array<Values & { start: string }>;
    };
  };

  async function moveTo(userId: string) {
    await dataSource.query(
      `UPDATE professional_service_areas SET locality_id = $1
        WHERE professional_id = (SELECT id FROM professional_profiles WHERE user_id = $2)`,
      [localityId, userId],
    );
  }

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    admin = browser((await signInAdmin(app)).client);
    const [cordoba] = await dataSource.query<Array<{ province_id: string }>>(
      `SELECT l.province_id FROM localities l JOIN provinces p ON p.id = l.province_id
        WHERE p.name = 'Córdoba' LIMIT 1`,
    );
    [{ id: localityId }] = await dataSource.query<Array<{ id: string }>>(
      `INSERT INTO localities (province_id, name) VALUES ($1, $2) RETURNING id`,
      [cordoba.province_id, `Métricas ${randomUUID().slice(0, 6)}`],
    );
    a = await listedProfessional(app);
    b = await listedProfessional(app);
    browser(a.client);
    browser(b.client);
    await moveTo(a.id);
    await moveTo(b.id);
    // A con Premium (incluye métricas y va primero en el catálogo); B sigue con la prueba en Basic.
    await dataSource.query(
      `UPDATE subscriptions SET plan_id = (SELECT id FROM subscription_plans WHERE code = 'PREMIUM')
        WHERE user_id = $1`,
      [a.id],
    );
    [{ slug: slugA }] = await dataSource.query<Array<{ slug: string }>>(
      `SELECT slug FROM professional_profiles WHERE user_id = $1`,
      [a.id],
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('cuenta personas distintas por día: no recargas, ni al propio profesional, robots o admin', async () => {
    const first = browser();
    const page = await search(first);
    expect((page.body as { data: Array<{ slug: string }> }).data[0].slug).toBe(slugA);
    await search(first);
    await first.get(`/catalog/professionals/${slugA}`);
    await first.get(`/catalog/professionals/${slugA}`);

    const second = browser();
    await search(second);
    await second.get(`/catalog/professionals/${slugA}`);

    const customer = browser((await signInCustomer(app)).client);
    await search(customer);

    // No cuentan: el propio A (sí suma para B, que ve debajo), un robot y el admin.
    await search(a.client);
    await a.client.get(`/catalog/professionals/${slugA}`);
    const robot = new Client(app);
    robot.agent.set('User-Agent', 'Googlebot/2.1 (+http://www.google.com/bot.html)');
    await search(robot);
    await robot.get(`/catalog/professionals/${slugA}`);
    await search(admin);
    await admin.get(`/catalog/professionals/${slugA}`);

    const mine = await metricsOf(a.client);
    expect(mine.total).toMatchObject({ profileViewers: 2, searchAppearances: 3, firstPlace: 3 });
    expect(mine.buckets.find((x) => x.start === today())).toMatchObject({ profileViewers: 2 });

    const ofB = await metricsOf(admin, `/admin/users/${b.id}/metrics`);
    expect(ofB.total).toMatchObject({ profileViewers: 0, searchAppearances: 4, firstPlace: 0 });

    // En la base solo hay números.
    const rows = await dataSource.query<Array<Record<string, unknown>>>(
      `SELECT * FROM professional_metrics_daily
        WHERE professional_id = (SELECT id FROM professional_profiles WHERE user_id = $1)`,
      [a.id],
    );
    expect(Object.keys(rows[0]).sort()).toEqual(
      ['day', 'first_place', 'professional_id', 'profile_viewers', 'search_appearances'].sort(),
    );
  });

  it('suma pedidos, trabajos terminados y reseñas del período', async () => {
    const customer = await signInCustomer(app);
    const [{ id: conversationId }] = await dataSource.query<Array<{ id: string }>>(
      `INSERT INTO conversations (customer_id, professional_id) VALUES ($1, $2) RETURNING id`,
      [customer.id, a.id],
    );
    const [{ id: requestId }] = await dataSource.query<Array<{ id: string }>>(
      `INSERT INTO service_requests (customer_id, profession_id, description, urgency)
       VALUES ($1, $2, 'Pierde agua la canilla', 'CAN_WAIT') RETURNING id`,
      [customer.id, a.professionId],
    );
    const [{ id: targetId }] = await dataSource.query<Array<{ id: string }>>(
      `INSERT INTO service_request_targets (request_id, professional_id, conversation_id, status)
       VALUES ($1, $2, $3, 'SELECTED') RETURNING id`,
      [requestId, a.id, conversationId],
    );
    const [{ id: contractId }] = await dataSource.query<Array<{ id: string }>>(
      `INSERT INTO service_contracts (request_id, target_id, customer_id, professional_id, status,
                                      started_at, completed_at)
       VALUES ($1, $2, $3, $4, 'COMPLETED', now(), now()) RETURNING id`,
      [requestId, targetId, customer.id, a.id],
    );
    await dataSource.query(
      `INSERT INTO reviews (contract_id, customer_id, professional_id, rating, comment)
       VALUES ($1, $2, $3, 4, 'Muy prolijo')`,
      [contractId, customer.id, a.id],
    );

    const res = await a.client.get('/professionals/me/metrics');
    const body = res.body as { total: Values; overallRating: { count: number; average: number } };
    expect(body.total).toMatchObject({
      requests: 1,
      completed: 1,
      ratingCount: 1,
      ratingAverage: 4,
    });
    expect(body.overallRating).toEqual({ count: 1, average: 4 });
  });

  it('agrupa por semana o mes y compara con el mismo tramo del período anterior', async () => {
    await dataSource.query(
      `INSERT INTO professional_metrics_daily (professional_id, day, profile_viewers)
       SELECT id, ($2::date - interval '1 month')::date, 7
         FROM professional_profiles WHERE user_id = $1`,
      [a.id, today()],
    );
    const month = await metricsOf(a.client, '/professionals/me/metrics', '?groupBy=month');
    expect(month.buckets).toHaveLength(1);
    expect(month.previous.profileViewers).toBe(7);

    const week = await metricsOf(a.client, '/professionals/me/metrics', '?groupBy=week');
    // Las semanas empiezan el lunes.
    expect(week.buckets.every((x) => new Date(`${x.start}T12:00:00Z`).getUTCDay() === 1)).toBe(
      true,
    );
    const bad = await a.client.get('/professionals/me/metrics?from=2026-11-10&to=2026-11-01');
    expect(bad.body.code).toBe('INVALID_RANGE');
  });

  it('solo las ve un plan con métricas (Premium); el admin, cualquiera, de solo lectura', async () => {
    const basic = await b.client.get('/professionals/me/metrics');
    expect(basic.status).toBe(403);
    expect(basic.body.code).toBe('PLAN_FEATURE_REQUIRED');

    const customer = await signInCustomer(app);
    expect((await customer.client.get('/professionals/me/metrics')).status).toBe(403);
    expect((await customer.client.get(`/admin/users/${a.id}/metrics`)).status).toBe(403);
    const notPro = await admin.get(`/admin/users/${customer.id}/metrics`);
    expect(notPro.body.code).toBe('PROFILE_NOT_FOUND');

    // Si se le vence el Premium, los datos quedan y los vuelve a ver al renovar.
    await dataSource.query(
      `UPDATE subscriptions SET plan_id = (SELECT id FROM subscription_plans WHERE code = 'BASIC')
        WHERE user_id = $1`,
      [a.id],
    );
    expect((await a.client.get('/professionals/me/metrics')).status).toBe(403);
    await dataSource.query(
      `UPDATE subscriptions SET plan_id = (SELECT id FROM subscription_plans WHERE code = 'PREMIUM')
        WHERE user_id = $1`,
      [a.id],
    );
    expect((await metricsOf(a.client)).total.profileViewers).toBe(2);
  });

  it('la limpieza diaria borra los días de más de 25 meses', async () => {
    await dataSource.query(
      `INSERT INTO professional_metrics_daily (professional_id, day, profile_viewers)
       SELECT id, ($2::date - interval '26 months')::date, 1 FROM professional_profiles
        WHERE user_id = $1
       UNION ALL
       SELECT id, ($2::date - interval '24 months')::date, 1 FROM professional_profiles
        WHERE user_id = $1`,
      [b.id, today()],
    );
    expect(await purgeOldMetrics(dataSource)).toBeGreaterThanOrEqual(1);
    const left = await dataSource.query<Array<{ day: string }>>(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day FROM professional_metrics_daily
        WHERE professional_id = (SELECT id FROM professional_profiles WHERE user_id = $1)
          AND day < $2::date - interval '23 months'`,
      [b.id, today()],
    );
    expect(left).toHaveLength(1);
  });
});

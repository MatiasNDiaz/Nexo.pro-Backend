import { DataSource, QueryFailedError } from 'typeorm';
import { seedCatalogs } from '../../src/database/seeds/seed-catalogs';
import { Locality } from '../../src/locations/entities/locality.entity';
import { Province } from '../../src/locations/entities/province.entity';
import { SubscriptionPlan } from '../../src/subscriptions/entities/subscription-plan.entity';
import { createTestDataSource } from '../setup/test-database';

const sqlStateOf = (error: unknown) =>
  error instanceof QueryFailedError ? (error.driverError as { code?: string }).code : undefined;

/** Ejecuta SQL dentro de una transacción que siempre se revierte (no ensucia la base). */
async function stateOf(dataSource: DataSource, sql: string, params: unknown[] = []) {
  const runner = dataSource.createQueryRunner();
  await runner.startTransaction();
  try {
    await runner.query(sql, params);
    return 'OK';
  } catch (error) {
    return sqlStateOf(error);
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
  }
}

describe('Catálogos maestros (integración)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await createTestDataSource().initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('el seed es idempotente', async () => {
    await expect(seedCatalogs(dataSource)).resolves.toEqual({
      provinces: 0,
      localities: 0,
      professions: 0,
      plans: 0,
    });
    await expect(dataSource.getRepository(SubscriptionPlan).count()).resolves.toBe(3);
  });

  it('carga los límites de Premium confirmados (5 imágenes, 2 videos de 15 s)', async () => {
    const premium = await dataSource
      .getRepository(SubscriptionPlan)
      .findOneByOrFail({ code: 'PREMIUM' });
    expect(premium).toMatchObject({
      maxImages: 5,
      maxVideos: 2,
      maxVideoSeconds: 15,
      maxProfessions: 3,
      priceAmount: '20000.00',
      currency: 'ARS',
    });
  });

  it('no pisa un precio que el admin haya cambiado', async () => {
    const plans = dataSource.getRepository(SubscriptionPlan);
    await plans.update({ code: 'BASIC' }, { priceAmount: '12345.00' });
    try {
      await seedCatalogs(dataSource);
      await expect(plans.findOneByOrFail({ code: 'BASIC' })).resolves.toMatchObject({
        priceAmount: '12345.00',
      });
    } finally {
      await plans.update({ code: 'BASIC' }, { priceAmount: '10000.00' });
    }
  });

  it('carga la localidad de Córdoba y ningún barrio (los crean los usuarios, ADR 0010)', async () => {
    const province = await dataSource.getRepository(Province).findOneByOrFail({ name: 'Córdoba' });
    const locality = await dataSource
      .getRepository(Locality)
      .findOneByOrFail({ provinceId: province.id });
    expect(locality).toMatchObject({ name: 'Córdoba', lat: null, lng: null });
    const [{ count }] = await dataSource.query<Array<{ count: string }>>(
      `SELECT count(*) FROM neighborhoods`,
    );
    expect(count).toBe('0');
  });

  describe('constraints de la base', () => {
    it('provincia duplicada sin importar mayúsculas → 23505', async () => {
      await expect(
        stateOf(dataSource, `INSERT INTO provinces (name) VALUES ('CÓRDOBA')`),
      ).resolves.toBe('23505');
    });

    it('no se puede borrar una provincia con localidades → 23503', async () => {
      await expect(
        stateOf(dataSource, `DELETE FROM provinces WHERE lower(name) = lower('Córdoba')`),
      ).resolves.toBe('23503');
    });

    it.each([
      ['precio negativo', `UPDATE subscription_plans SET price_amount = -1 WHERE code = 'BASIC'`],
      ['moneda inválida', `UPDATE subscription_plans SET currency = 'ar$' WHERE code = 'BASIC'`],
      ['sin profesiones', `UPDATE subscription_plans SET max_professions = 0 WHERE code = 'BASIC'`],
      ['slug inválido', `INSERT INTO professions (name, slug) VALUES ('Otro', 'Con Espacios')`],
      ['coordenada incompleta', `UPDATE localities SET lat = -31.4 WHERE lng IS NULL`],
    ])('%s → 23514', async (_case, sql) => {
      await expect(stateOf(dataSource, sql)).resolves.toBe('23514');
    });
  });
});

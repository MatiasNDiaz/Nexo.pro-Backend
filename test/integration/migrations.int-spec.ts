import type { DataSource } from 'typeorm';
import { MIGRATIONS } from '../../src/database/migrations';
import { seedCatalogs } from '../../src/database/seeds/seed-catalogs';
import { createTestDataSource } from '../setup/test-database';

/**
 * Corre sobre la base de test que el globalSetup dejó migrada. Termina dejándola igual
 * (migrada y con catálogos) para los demás archivos de integración.
 */
describe('Migraciones (integración)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await createTestDataSource().initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('las entidades coinciden exactamente con el esquema creado por las migraciones', async () => {
    const pending = await dataSource.driver.createSchemaBuilder().log();
    expect(pending.upQueries.map((query) => query.query)).toEqual([]);
  });

  it('se pueden revertir todas y volver a aplicar desde cero', async () => {
    for (let i = 0; i < MIGRATIONS.length; i++) {
      await dataSource.undoLastMigration({ transaction: 'each' });
    }
    const tables: Array<{ table_name: string }> = await dataSource.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    expect(tables.map((row) => row.table_name)).toEqual(['typeorm_migrations']);
    const types: unknown[] = await dataSource.query(
      `SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typtype = 'e'`,
    );
    expect(types).toHaveLength(0);

    const applied = await dataSource.runMigrations({ transaction: 'each' });
    expect(applied).toHaveLength(MIGRATIONS.length);
    await seedCatalogs(dataSource);
  });
});

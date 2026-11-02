import { DataSource } from 'typeorm';
import { validateEnv } from '../../src/config/env.validation';
import { loadEnvFiles } from '../../src/config/load-env-files';
import { buildDataSourceOptions } from '../../src/database/data-source.options';
import { seedCatalogs } from '../../src/database/seeds/seed-catalogs';

/**
 * Conexión a la base de TEST. Se niega a seguir si no estamos en NODE_ENV=test o si el nombre de la
 * base no termina en `_test`: el reset borra el esquema completo.
 */
export function createTestDataSource(): DataSource {
  process.env.NODE_ENV = 'test';
  loadEnvFiles('test');
  const env = validateEnv(process.env);
  const url = env.DATABASE_MIGRATIONS_URL ?? env.DATABASE_URL;
  const databaseName = new URL(url).pathname.slice(1);
  if (!databaseName.endsWith('_test')) {
    throw new Error(`La base de tests debe terminar en "_test" (es "${databaseName}").`);
  }
  return new DataSource(buildDataSourceOptions({ url, ssl: env.DB_SSL, poolMax: 2 }));
}

/** Esquema vacío → todas las migraciones → catálogos. */
export async function resetTestDatabase(): Promise<void> {
  const dataSource = createTestDataSource();
  await dataSource.initialize();
  try {
    await dataSource.query('DROP SCHEMA IF EXISTS public CASCADE');
    await dataSource.query('CREATE SCHEMA public');
    await dataSource.runMigrations({ transaction: 'each' });
    await seedCatalogs(dataSource);
  } finally {
    await dataSource.destroy();
  }
}

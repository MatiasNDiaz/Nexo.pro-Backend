import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.validation';
import { loadEnvFiles } from '../config/load-env-files';
import { buildDataSourceOptions } from './data-source.options';

/**
 * DataSource para la CLI de TypeORM (migraciones). Usa la conexión con permisos de DDL
 * (DATABASE_MIGRATIONS_URL) y, si no está definida, DATABASE_URL.
 *   npm run migration:run | migration:revert | migration:show
 */
loadEnvFiles();
const env = validateEnv(process.env);

export default new DataSource(
  buildDataSourceOptions({
    url: env.DATABASE_MIGRATIONS_URL ?? env.DATABASE_URL,
    ssl: env.DB_SSL,
    poolMax: 2,
  }),
);

import { ConfigType, registerAs } from '@nestjs/config';
import { validateEnv } from './env.validation';

/** Configuración tipada del namespace `database`. */
export const databaseConfig = registerAs('database', () => {
  const env = validateEnv(process.env);
  return {
    url: env.DATABASE_URL,
    migrationsUrl: env.DATABASE_MIGRATIONS_URL ?? env.DATABASE_URL,
    ssl: env.DB_SSL,
    poolMax: env.DB_POOL_MAX,
  };
});

export type DatabaseConfig = ConfigType<typeof databaseConfig>;

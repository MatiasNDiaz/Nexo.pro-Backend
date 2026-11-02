import type { DataSourceOptions } from 'typeorm';
import { AdminAuditLog } from '../audit/entities/admin-audit-log.entity';
import { Locality } from '../locations/entities/locality.entity';
import { Neighborhood } from '../locations/entities/neighborhood.entity';
import { Province } from '../locations/entities/province.entity';
import { Profession } from '../professions/entities/profession.entity';
import { SubscriptionPlan } from '../subscriptions/entities/subscription-plan.entity';
import { MIGRATIONS } from './migrations';
import { SnakeNamingStrategy } from './snake-naming.strategy';

/** Todas las entidades, en un solo lugar (sin globs: funciona igual en Jest, CLI y producción). */
export const ENTITIES = [
  AdminAuditLog,
  Province,
  Locality,
  Neighborhood,
  Profession,
  SubscriptionPlan,
];

export interface ConnectionSettings {
  url: string;
  ssl: boolean;
  poolMax: number;
}

/** Opciones compartidas por la app, la CLI de migraciones y los tests. */
export function buildDataSourceOptions(connection: ConnectionSettings): DataSourceOptions {
  return {
    type: 'postgres',
    url: connection.url,
    ssl: connection.ssl ? { rejectUnauthorized: true } : false,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsTableName: 'typeorm_migrations',
    namingStrategy: new SnakeNamingStrategy(),
    // El esquema cambia SOLO con migraciones revisadas a mano, en todos los ambientes.
    synchronize: false,
    migrationsRun: false,
    // El logger de TypeORM imprime los parámetros de las queries fallidas (datos personales).
    logging: false,
    // Default de los UUID: gen_random_uuid() (nativo). Las extensiones las crean las migraciones:
    // el usuario de runtime no tiene permisos para hacerlo.
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    extra: { max: connection.poolMax, application_name: 'nexo-pro-api' },
  };
}

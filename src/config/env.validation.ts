import { plainToInstance, Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  validateSync,
  ValidationError,
} from 'class-validator';

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Origen exacto: esquema + host + puerto opcional, sin path, sin barra final y sin comodines. */
const ORIGIN_PATTERN = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i;

const POSTGRES_URL_PATTERN = /^postgres(ql)?:\/\/\S+$/;

const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true' ? true : value === false || value === 'false' ? false : value;

const toInt = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

const toList = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : value;

/**
 * Variables de entorno de la aplicación. Cada etapa agrega las suyas (auth, base de datos, etc.).
 * Los valores por defecto viven solo acá: ningún otro archivo repite `3001` ni `'api'`.
 */
export class EnvironmentVariables {
  @IsIn(NODE_ENVS)
  NODE_ENV: NodeEnv;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3001;

  @IsString()
  @Matches(/^[a-z][a-z0-9-]*$/)
  API_PREFIX = 'api';

  @Transform(toList)
  @ArrayNotEmpty()
  @Matches(ORIGIN_PATTERN, {
    each: true,
    message: 'cada origen debe ser exacto (https://host[:puerto])',
  })
  FRONTEND_ORIGINS: string[];

  /** Cantidad de proxies delante de la API (Railway = 1). 0 = no confiar en X-Forwarded-For. */
  @Transform(toInt)
  @IsInt()
  @Min(0)
  @Max(5)
  TRUST_PROXY = 0;

  @IsString()
  @Matches(/^\d+(kb|mb)$/)
  BODY_LIMIT = '100kb';

  @Transform(toBoolean)
  @IsBoolean()
  SWAGGER_ENABLED = false;

  @IsIn(LOG_LEVELS)
  LOG_LEVEL: LogLevel = 'info';

  @Transform(toInt)
  @IsInt()
  @Min(1000)
  THROTTLE_TTL_MS = 60_000;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT = 100;

  /** Conexión de runtime (usuario con privilegios mínimos: solo SELECT/INSERT/UPDATE/DELETE). */
  @Matches(POSTGRES_URL_PATTERN)
  DATABASE_URL: string;

  /** Conexión con permisos de DDL, solo para migraciones y seeds. Si falta, se usa DATABASE_URL. */
  @IsOptional()
  @Matches(POSTGRES_URL_PATTERN)
  DATABASE_MIGRATIONS_URL?: string;

  @Transform(toBoolean)
  @IsBoolean()
  DB_SSL = false;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(50)
  DB_POOL_MAX = 10;
}

/** Reglas que dependen del ambiente y no se expresan con un decorador por campo. */
function productionRules(env: EnvironmentVariables): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  if (env.SWAGGER_ENABLED) problems.push('SWAGGER_ENABLED (no se permite en producción)');
  if (env.FRONTEND_ORIGINS.some((origin) => !origin.startsWith('https://'))) {
    problems.push('FRONTEND_ORIGINS (en producción todos los orígenes deben ser https)');
  }
  return problems;
}

/**
 * Valida y tipa el entorno. Si algo falla, el mensaje lista los NOMBRES de las variables y la regla
 * incumplida, nunca sus valores (podrían ser secretos).
 */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, { exposeDefaultValues: true });
  const errors = validateSync(env, { skipMissingProperties: false, whitelist: false });
  const problems = [...errors.map(describe), ...(errors.length ? [] : productionRules(env))];
  if (problems.length > 0) {
    throw new Error(
      `Configuración inválida. Revisá estas variables de entorno: ${problems.join('; ')}`,
    );
  }
  return env;
}

function describe(error: ValidationError): string {
  const rules = Object.keys(error.constraints ?? {}).join(', ');
  return `${error.property} (${rules})`;
}

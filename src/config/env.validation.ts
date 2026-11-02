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
  MinLength,
  validateSync,
  ValidationError,
} from 'class-validator';

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export const MAIL_PROVIDERS = ['console', 'memory'] as const;
export type MailProviderName = (typeof MAIL_PROVIDERS)[number];

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

  // ---- Autenticación (etapa 5, ADR 0008) ----

  /** URL base del frontend para los enlaces de los emails. Nunca se arma con el header Host. */
  @Matches(ORIGIN_PATTERN)
  FRONTEND_URL: string;

  /** Secreto HS256 del access token (≥ 64 caracteres aleatorios). */
  @IsString()
  @MinLength(64)
  JWT_ACCESS_SECRET: string;

  /** Secreto anterior, solo durante una rotación: se acepta para verificar, nunca para firmar. */
  @IsOptional()
  @IsString()
  @MinLength(64)
  JWT_ACCESS_SECRET_PREVIOUS?: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  JWT_ISSUER = 'nexo-api';

  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  JWT_AUDIENCE = 'nexo-web';

  @Transform(toInt)
  @IsInt()
  @Min(60)
  ACCESS_TOKEN_TTL_SEC = 600;

  @Transform(toInt)
  @IsInt()
  @Min(60)
  ADMIN_ACCESS_TOKEN_TTL_SEC = 300;

  @Transform(toInt)
  @IsInt()
  @Min(300)
  REFRESH_IDLE_TTL_SEC = 14 * 24 * 3600;

  @Transform(toInt)
  @IsInt()
  @Min(300)
  ADMIN_REFRESH_IDLE_TTL_SEC = 12 * 3600;

  @Transform(toInt)
  @IsInt()
  @Min(300)
  REFRESH_ABSOLUTE_TTL_SEC = 30 * 24 * 3600;

  @Transform(toInt)
  @IsInt()
  @Min(300)
  ADMIN_REFRESH_ABSOLUTE_TTL_SEC = 7 * 24 * 3600;

  /** Cookies con `Secure` y prefijos `__Host-`/`__Secure-`. Obligatorio en producción. */
  @Transform(toBoolean)
  @IsBoolean()
  COOKIE_SECURE = false;

  /** Secreto HMAC del token CSRF (≥ 32 caracteres aleatorios). */
  @IsString()
  @MinLength(32)
  CSRF_SECRET: string;

  /** Clave AES-256-GCM para datos cifrados (p. ej. el secreto TOTP): 64 caracteres hex. */
  @Matches(/^[0-9a-fA-F]{64}$/)
  DATA_ENCRYPTION_KEY: string;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  DATA_ENCRYPTION_KEY_VERSION = 1;

  /** Clave HMAC para seudonimizar datos (p. ej. IP de las sesiones). ≥ 32 caracteres. */
  @IsString()
  @MinLength(32)
  DATA_HMAC_KEY: string;

  /** "Olvidé mi contraseña" autoservicio. Apagado por decisión del fundador (ADR 0002). */
  @Transform(toBoolean)
  @IsBoolean()
  PASSWORD_SELF_RESET_ENABLED = false;

  @IsIn(MAIL_PROVIDERS)
  MAIL_PROVIDER: MailProviderName = 'console';

  @IsString()
  @MinLength(3)
  MAIL_FROM = 'Nexo PRO <no-reply@localhost>';

  /** Días que una cuenta dada de baja queda restaurable antes de anonimizarse (ADR 0016). */
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(365)
  ACCOUNT_DELETION_GRACE_DAYS = 30;

  /** Máximo de zonas (barrios o localidades completas) por profesional (ADR 0010). */
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(100)
  MAX_SERVICE_AREAS = 20;
}

/** Reglas que dependen del ambiente y no se expresan con un decorador por campo. */
function productionRules(env: EnvironmentVariables): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  if (env.SWAGGER_ENABLED) problems.push('SWAGGER_ENABLED (no se permite en producción)');
  if (env.FRONTEND_ORIGINS.some((origin) => !origin.startsWith('https://'))) {
    problems.push('FRONTEND_ORIGINS (en producción todos los orígenes deben ser https)');
  }
  if (!env.FRONTEND_URL.startsWith('https://')) {
    problems.push('FRONTEND_URL (en producción debe ser https)');
  }
  if (!env.COOKIE_SECURE) problems.push('COOKIE_SECURE (en producción debe ser true)');
  // Los adaptadores de desarrollo imprimirían enlaces con tokens en la consola o los perderían.
  if (env.MAIL_PROVIDER === 'console' || env.MAIL_PROVIDER === 'memory') {
    problems.push('MAIL_PROVIDER (en producción hace falta un proveedor real de email)');
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

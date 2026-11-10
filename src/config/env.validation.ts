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

export const STORAGE_PROVIDERS = ['local', 'cloudinary'] as const;
export type StorageProviderName = (typeof STORAGE_PROVIDERS)[number];

export const IDENTITY_PROVIDERS = ['manual', 'fake'] as const;
export const GOOGLE_PROVIDERS = ['disabled', 'google', 'fake'] as const;
export type GoogleProviderName = (typeof GOOGLE_PROVIDERS)[number];
export type IdentityProviderName = (typeof IDENTITY_PROVIDERS)[number];

export const PAYMENTS_PROVIDERS = ['disabled', 'mercadopago', 'fake'] as const;
export type PaymentsProviderName = (typeof PAYMENTS_PROVIDERS)[number];

export const PUSH_PROVIDERS = ['disabled', 'webpush', 'fake'] as const;
export type PushProviderName = (typeof PUSH_PROVIDERS)[number];

export const MAIL_PROVIDERS = ['console', 'memory', 'resend'] as const;
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

  /** Tiempo máximo de una consulta de la app (las migraciones no lo usan). */
  @Transform(toInt)
  @IsInt()
  @Min(1000)
  @Max(120_000)
  DB_STATEMENT_TIMEOUT_MS = 15_000;

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

  /** Clave de Resend (ADR 0035), obligatoria con MAIL_PROVIDER=resend. **Secreta**. */
  @IsOptional()
  @Matches(/^re_[A-Za-z0-9_]{20,}$/)
  RESEND_API_KEY?: string;

  // ---- Archivos (ADR 0018) ----

  /** `local` (desarrollo y tests: disco) o `cloudinary`. En producción, solo cloudinary. */
  @IsIn(STORAGE_PROVIDERS)
  STORAGE_PROVIDER: StorageProviderName = 'local';

  /** Carpeta del adaptador local (no se versiona). */
  @IsString()
  @MinLength(1)
  STORAGE_LOCAL_DIR = '.uploads';

  @IsOptional()
  @Matches(/^[a-z0-9_-]+$/i)
  CLOUDINARY_CLOUD_NAME?: string;

  @IsOptional()
  @Matches(/^\d+$/)
  CLOUDINARY_API_KEY?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  CLOUDINARY_API_SECRET?: string;

  /** Carpeta raíz en Cloudinary (separa ambientes en la misma cuenta). */
  @Matches(/^[a-z0-9_-]+$/)
  CLOUDINARY_FOLDER = 'nexo-dev';

  // ---- Verificación de identidad (ADR 0003) ----

  /** `manual` (el admin decide) o `fake` (solo desarrollo y tests: simula un KYC con webhooks). */
  @IsIn(IDENTITY_PROVIDERS)
  IDENTITY_PROVIDER: IdentityProviderName = 'manual';

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(10)
  IDENTITY_MAX_ATTEMPTS = 3;

  /** Solo con IDENTITY_PROVIDER=fake: secreto HMAC de sus webhooks simulados (≥ 32). */
  @IsOptional()
  @IsString()
  @MinLength(32)
  FAKE_IDENTITY_WEBHOOK_SECRET?: string;

  // ---- Login con Google (ADR 0015 y 0023) ----

  /** `disabled` (sin botón de Google), `google` o `fake` (simulado: prohibido en producción). */
  @IsIn(GOOGLE_PROVIDERS)
  GOOGLE_PROVIDER: GoogleProviderName = 'disabled';

  @IsOptional()
  @IsString()
  @MinLength(10)
  GOOGLE_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  GOOGLE_CLIENT_SECRET?: string;

  /** URL pública de `/api/v1/auth/google/callback` (la registrada en Google Cloud). */
  @IsOptional()
  @Matches(/^https?:\/\/[a-z0-9.-]+(:\d{1,5})?\/\S*$/i)
  GOOGLE_CALLBACK_URL?: string;

  // ---- Pagos (ADR 0026) ----

  /** `disabled` (sin cobros), `mercadopago` o `fake` (simulado: prohibido en producción). */
  @IsIn(PAYMENTS_PROVIDERS)
  PAYMENTS_PROVIDER: PaymentsProviderName = 'disabled';

  @IsOptional()
  @IsString()
  @MinLength(20)
  MERCADOPAGO_ACCESS_TOKEN?: string;

  /** Clave secreta de las notificaciones (valida la firma `x-signature`). ≥ 32 caracteres. */
  @IsOptional()
  @IsString()
  @MinLength(32)
  MERCADOPAGO_WEBHOOK_SECRET?: string;

  /** URL pública de la API (sin prefijo), para armar la URL del webhook de pagos. */
  @IsOptional()
  @Matches(ORIGIN_PATTERN)
  API_PUBLIC_URL?: string;

  // ---- Antiabuso (etapa 12) ----

  /** Rechaza contraseñas filtradas (Have I Been Pwned, k-anonimato). Apagado por defecto. */
  @Transform(toBoolean)
  @IsBoolean()
  PASSWORD_BREACH_CHECK = false;

  /** Clave secreta de Cloudflare Turnstile. Sin ella, el CAPTCHA queda apagado. */
  @IsOptional()
  @IsString()
  @MinLength(20)
  TURNSTILE_SECRET_KEY?: string;

  /**
   * Secreto que Cloudflare agrega en el encabezado `x-nexo-edge-secret` (regla de transformación).
   * Solo con él se confía en la ciudad aproximada de Cloudflare (ADR 0031). Sin él: sin ciudad.
   */
  @IsOptional()
  @IsString()
  @MinLength(32)
  CLOUDFLARE_EDGE_SECRET?: string;

  // ---- Notificaciones push (etapa 13.3, ADR 0032) ----

  /** `disabled` (sin push), `webpush` (con claves VAPID) o `fake` (tests: prohibido en producción). */
  @IsIn(PUSH_PROVIDERS)
  PUSH_PROVIDER: PushProviderName = 'disabled';

  /** Clave pública VAPID (`npm run push:keys`). La usa el navegador para suscribirse. */
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{87}$/)
  VAPID_PUBLIC_KEY?: string;

  /** Clave privada VAPID. **Secreta**: cambiarla invalida todas las suscripciones. */
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  VAPID_PRIVATE_KEY?: string;

  /** Contacto para los servicios de push: `mailto:` o una URL https. */
  @IsOptional()
  @Matches(/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/)
  VAPID_SUBJECT?: string;

  // ---- Monitoreo (etapa 12) ----

  /** DSN de Sentry. Sin él, el reporte de errores queda apagado. */
  @IsOptional()
  @Matches(/^https:\/\/[A-Za-z0-9]+@[a-z0-9.-]+\/\d+$/)
  SENTRY_DSN?: string;

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

/** Variables que pasan a ser obligatorias según el proveedor elegido. */
function providerRules(env: EnvironmentVariables): string[] {
  const problems: string[] = [];
  if (env.STORAGE_PROVIDER === 'cloudinary') {
    for (const name of [
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ] as const) {
      if (!env[name]) problems.push(`${name} (obligatoria con STORAGE_PROVIDER=cloudinary)`);
    }
  }
  if (env.GOOGLE_PROVIDER === 'google') {
    for (const name of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const) {
      if (!env[name]) problems.push(`${name} (obligatoria con GOOGLE_PROVIDER=google)`);
    }
  }
  if (env.GOOGLE_PROVIDER !== 'disabled' && !env.GOOGLE_CALLBACK_URL) {
    problems.push('GOOGLE_CALLBACK_URL (obligatoria con el login con Google activado)');
  }
  if (env.IDENTITY_PROVIDER === 'fake' && !env.FAKE_IDENTITY_WEBHOOK_SECRET) {
    problems.push('FAKE_IDENTITY_WEBHOOK_SECRET (obligatoria con IDENTITY_PROVIDER=fake)');
  }
  if (env.PAYMENTS_PROVIDER === 'mercadopago' && !env.MERCADOPAGO_ACCESS_TOKEN) {
    problems.push('MERCADOPAGO_ACCESS_TOKEN (obligatoria con PAYMENTS_PROVIDER=mercadopago)');
  }
  if (env.MAIL_PROVIDER === 'resend') {
    if (!env.RESEND_API_KEY) problems.push('RESEND_API_KEY (obligatoria con MAIL_PROVIDER=resend)');
    // Resend rechaza remitentes de dominios no verificados; localhost nunca lo está.
    if (/@localhost>?$/.test(env.MAIL_FROM)) {
      problems.push('MAIL_FROM (con Resend, un email de tu dominio verificado)');
    }
  }
  if (env.PUSH_PROVIDER === 'webpush') {
    for (const name of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const) {
      if (!env[name]) problems.push(`${name} (obligatoria con PUSH_PROVIDER=webpush)`);
    }
  }
  if (env.PAYMENTS_PROVIDER !== 'disabled') {
    for (const name of ['MERCADOPAGO_WEBHOOK_SECRET', 'API_PUBLIC_URL'] as const) {
      if (!env[name]) problems.push(`${name} (obligatoria con los pagos activados)`);
    }
  }
  return problems;
}

/** Reglas que dependen del ambiente y no se expresan con un decorador por campo. */
function productionRules(env: EnvironmentVariables): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  // El disco de Railway es efímero: los archivos se perderían en cada deploy.
  if (env.STORAGE_PROVIDER === 'local') {
    problems.push('STORAGE_PROVIDER (en producción los archivos van a Cloudinary)');
  }
  if (env.IDENTITY_PROVIDER === 'fake') {
    problems.push('IDENTITY_PROVIDER (el proveedor simulado está prohibido en producción)');
  }
  if (env.GOOGLE_PROVIDER === 'fake') {
    problems.push('GOOGLE_PROVIDER (el login simulado está prohibido en producción)');
  }
  if (env.GOOGLE_CALLBACK_URL && !env.GOOGLE_CALLBACK_URL.startsWith('https://')) {
    problems.push('GOOGLE_CALLBACK_URL (en producción debe ser https)');
  }
  if (env.PAYMENTS_PROVIDER === 'fake') {
    problems.push('PAYMENTS_PROVIDER (los pagos simulados están prohibidos en producción)');
  }
  if (env.PUSH_PROVIDER === 'fake') {
    problems.push('PUSH_PROVIDER (el push simulado está prohibido en producción)');
  }
  if (env.API_PUBLIC_URL && !env.API_PUBLIC_URL.startsWith('https://')) {
    problems.push('API_PUBLIC_URL (en producción debe ser https)');
  }
  // Railway pone un proxy delante: sin confiar en él, todos los pedidos llegan con la IP del proxy
  // y el límite por IP (y el bloqueo de fuerza bruta por IP) dejan de servir.
  if (env.TRUST_PROXY < 1) problems.push('TRUST_PROXY (en producción va 1: el proxy de Railway)');
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
  const problems = [
    ...errors.map(describe),
    ...(errors.length ? [] : [...providerRules(env), ...productionRules(env)]),
  ];
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

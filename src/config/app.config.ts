import { ConfigType, registerAs } from '@nestjs/config';
import { validateEnv } from './env.validation';

/** Configuración tipada del namespace `app`. Se inyecta con `@Inject(appConfig.KEY)`. */
export const appConfig = registerAs('app', () => {
  const env = validateEnv(process.env);
  return {
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    port: env.PORT,
    apiPrefix: env.API_PREFIX,
    frontendOrigins: env.FRONTEND_ORIGINS,
    trustProxy: env.TRUST_PROXY,
    bodyLimit: env.BODY_LIMIT,
    swaggerEnabled: env.SWAGGER_ENABLED,
    logLevel: env.LOG_LEVEL,
    throttle: { ttlMs: env.THROTTLE_TTL_MS, limit: env.THROTTLE_LIMIT },
  };
});

export type AppConfig = ConfigType<typeof appConfig>;

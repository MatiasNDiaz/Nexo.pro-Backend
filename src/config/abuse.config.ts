import { ConfigType, registerAs } from '@nestjs/config';
import { validateEnv } from './env.validation';

/**
 * Antiabuso (etapa 12): contraseñas filtradas y CAPTCHA. Apagados por defecto. También el secreto
 * de Cloudflare para confiar en su ubicación aproximada (etapa 13.2, ADR 0031).
 */
export const abuseConfig = registerAs('abuse', () => {
  const env = validateEnv(process.env);
  return {
    passwordBreachCheck: env.PASSWORD_BREACH_CHECK,
    turnstileSecret: env.TURNSTILE_SECRET_KEY ?? '',
    cloudflareEdgeSecret: env.CLOUDFLARE_EDGE_SECRET ?? '',
  };
});

export type AbuseConfig = ConfigType<typeof abuseConfig>;

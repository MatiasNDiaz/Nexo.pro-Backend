import { ConfigType, registerAs } from '@nestjs/config';
import { validateEnv } from './env.validation';

/** Antiabuso (etapa 12): contraseñas filtradas y CAPTCHA. Apagados por defecto. */
export const abuseConfig = registerAs('abuse', () => {
  const env = validateEnv(process.env);
  return {
    passwordBreachCheck: env.PASSWORD_BREACH_CHECK,
    turnstileSecret: env.TURNSTILE_SECRET_KEY ?? '',
  };
});

export type AbuseConfig = ConfigType<typeof abuseConfig>;

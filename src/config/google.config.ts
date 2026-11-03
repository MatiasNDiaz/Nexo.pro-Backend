import { ConfigType, registerAs } from '@nestjs/config';
import { validateEnv } from './env.validation';

/** Login con Google (ADR 0015 y 0023). Sin credenciales, el adaptador simulado o apagado. */
export const googleConfig = registerAs('google', () => {
  const env = validateEnv(process.env);
  return {
    provider: env.GOOGLE_PROVIDER,
    clientId: env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
    callbackUrl: env.GOOGLE_CALLBACK_URL ?? '',
  };
});

export type GoogleConfig = ConfigType<typeof googleConfig>;

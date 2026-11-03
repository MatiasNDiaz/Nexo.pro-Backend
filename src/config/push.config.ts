import { ConfigType, registerAs } from '@nestjs/config';
import { validateEnv } from './env.validation';

/** Notificaciones push web (ADR 0032). Sin claves VAPID, apagado. */
export const pushConfig = registerAs('push', () => {
  const env = validateEnv(process.env);
  return {
    provider: env.PUSH_PROVIDER,
    vapid: {
      publicKey: env.VAPID_PUBLIC_KEY ?? '',
      privateKey: env.VAPID_PRIVATE_KEY ?? '',
      subject: env.VAPID_SUBJECT ?? '',
    },
  };
});

export type PushConfig = ConfigType<typeof pushConfig>;

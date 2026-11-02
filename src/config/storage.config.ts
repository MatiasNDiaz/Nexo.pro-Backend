import { ConfigType, registerAs } from '@nestjs/config';
import { validateEnv } from './env.validation';

/** Configuración tipada de archivos (ADR 0018). Las credenciales solo existen en el entorno. */
export const storageConfig = registerAs('storage', () => {
  const env = validateEnv(process.env);
  return {
    provider: env.STORAGE_PROVIDER,
    localDir: env.STORAGE_LOCAL_DIR,
    cloudinary: {
      cloudName: env.CLOUDINARY_CLOUD_NAME ?? '',
      apiKey: env.CLOUDINARY_API_KEY ?? '',
      apiSecret: env.CLOUDINARY_API_SECRET ?? '',
      folder: env.CLOUDINARY_FOLDER,
    },
  };
});

export type StorageConfig = ConfigType<typeof storageConfig>;

/** Configuración de la verificación de identidad (ADR 0003). */
export const identityConfig = registerAs('identity', () => {
  const env = validateEnv(process.env);
  return {
    provider: env.IDENTITY_PROVIDER,
    maxAttempts: env.IDENTITY_MAX_ATTEMPTS,
    fakeWebhookSecret: env.FAKE_IDENTITY_WEBHOOK_SECRET ?? '',
  };
});

export type IdentityConfig = ConfigType<typeof identityConfig>;

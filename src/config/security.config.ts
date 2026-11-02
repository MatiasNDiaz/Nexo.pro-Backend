import { ConfigType, registerAs } from '@nestjs/config';
import { validateEnv } from './env.validation';

/** Claves de cifrado y de seudonimización. Viven solo en el entorno, nunca en la base. */
export const securityConfig = registerAs('security', () => {
  const env = validateEnv(process.env);
  return {
    encryptionKey: Buffer.from(env.DATA_ENCRYPTION_KEY, 'hex'),
    encryptionKeyVersion: env.DATA_ENCRYPTION_KEY_VERSION,
    hmacKey: env.DATA_HMAC_KEY,
  };
});

export type SecurityConfig = ConfigType<typeof securityConfig>;

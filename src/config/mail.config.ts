import { ConfigType, registerAs } from '@nestjs/config';
import { validateEnv } from './env.validation';

export const mailConfig = registerAs('mail', () => {
  const env = validateEnv(process.env);
  return { provider: env.MAIL_PROVIDER, from: env.MAIL_FROM, resendApiKey: env.RESEND_API_KEY };
});

export type MailConfig = ConfigType<typeof mailConfig>;

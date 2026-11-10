import { Global, Module } from '@nestjs/common';
import { MailConfig, mailConfig } from '../../config/mail.config';
import { ConsoleMailProvider } from './console-mail.provider';
import { MAIL_PROVIDER, MailProvider } from './mail-provider';
import { MemoryMailProvider } from './memory-mail.provider';
import { ResendMailProvider } from './resend-mail.provider';

export function createMailProvider(config: MailConfig): MailProvider {
  switch (config.provider) {
    case 'console':
      return new ConsoleMailProvider();
    case 'memory':
      return new MemoryMailProvider();
    case 'resend':
      // La validación del entorno exige la clave con MAIL_PROVIDER=resend.
      return new ResendMailProvider(config.resendApiKey!, config.from);
  }
}

@Global()
@Module({
  providers: [{ provide: MAIL_PROVIDER, inject: [mailConfig.KEY], useFactory: createMailProvider }],
  exports: [MAIL_PROVIDER],
})
export class MailModule {}

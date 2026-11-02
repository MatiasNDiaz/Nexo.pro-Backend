import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { type AuthConfig, authConfig } from '../config/auth.config';
import {
  MAIL_PROVIDER,
  type MailMessage,
  type MailProvider,
} from '../integrations/mail/mail-provider';
import {
  alreadyRegisteredMail,
  emailVerificationMail,
  FRONTEND_PATHS,
  passwordChangedMail,
  passwordResetMail,
} from './auth-mail.templates';
import {
  type AlreadyRegisteredEvent,
  AuthEvents,
  type TokenMailEvent,
  type UserMailEvent,
} from './auth.events';

/**
 * Envía los emails de autenticación. Los enlaces se arman con FRONTEND_URL fija (nunca con el
 * header Host). Si el envío falla, la operación ya está confirmada: se registra el error sin
 * datos personales y el usuario puede pedir el reenvío.
 */
@Injectable()
export class AuthMailListener {
  private readonly logger = new Logger(AuthMailListener.name);

  constructor(
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
    @Inject(authConfig.KEY) private readonly config: AuthConfig,
  ) {}

  @OnEvent(AuthEvents.EMAIL_VERIFICATION_REQUESTED, { promisify: true })
  onEmailVerification(event: TokenMailEvent): Promise<void> {
    const link = this.link(FRONTEND_PATHS.verifyEmail, event.token);
    return this.send(emailVerificationMail(event.email, event.firstName, link));
  }

  @OnEvent(AuthEvents.ALREADY_REGISTERED, { promisify: true })
  onAlreadyRegistered(event: AlreadyRegisteredEvent): Promise<void> {
    return this.send(alreadyRegisteredMail(event.email));
  }

  @OnEvent(AuthEvents.PASSWORD_RESET_REQUESTED, { promisify: true })
  onPasswordReset(event: TokenMailEvent): Promise<void> {
    const link = this.link(FRONTEND_PATHS.resetPassword, event.token);
    return this.send(passwordResetMail(event.email, event.firstName, link));
  }

  @OnEvent(AuthEvents.PASSWORD_CHANGED, { promisify: true })
  onPasswordChanged(event: UserMailEvent): Promise<void> {
    return this.send(passwordChangedMail(event.email, event.firstName));
  }

  private link(path: string, token: string): string {
    const url = new URL(path, this.config.frontendUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }

  private async send(message: MailMessage): Promise<void> {
    try {
      await this.mail.send(message);
    } catch (error) {
      this.logger.error(`No se pudo enviar el email "${message.subject}"`, error);
    }
  }
}

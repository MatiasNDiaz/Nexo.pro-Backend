import { MailMessage, MailProvider } from './mail-provider';

/** Solo tests: guarda los emails en memoria para leer los enlaces desde los e2e. */
export class MemoryMailProvider implements MailProvider {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  /** Último email enviado a esa dirección (o undefined). */
  lastTo(email: string): MailMessage | undefined {
    return [...this.sent].reverse().find((message) => message.to === email.toLowerCase());
  }
}

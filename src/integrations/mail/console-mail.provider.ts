import { MailMessage, MailProvider } from './mail-provider';

/**
 * Solo desarrollo: imprime el email en la terminal (los enlaces incluyen tokens). Escribe directo
 * en stdout y no en el logger para que nunca termine en un sistema de logs. Prohibido en
 * producción por la validación del entorno.
 */
export class ConsoleMailProvider implements MailProvider {
  send(message: MailMessage): Promise<void> {
    process.stdout.write(
      `\n----- EMAIL (desarrollo) -----\nPara: ${message.to}\nAsunto: ${message.subject}\n\n${message.text}\n------------------------------\n`,
    );
    return Promise.resolve();
  }
}

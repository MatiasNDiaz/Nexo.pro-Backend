/**
 * Contrato del proveedor de email transaccional. El proveedor real (SPF/DKIM, dominio propio) se
 * conecta cuando el fundador lo elija; los servicios dependen solo de esta interfaz.
 */
export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}

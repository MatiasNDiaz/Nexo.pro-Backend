import { MailMessage, MailProvider } from './mail-provider';

const RESEND_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

/** El proveedor respondió con un error o no respondió: el email no salió. */
export class MailDeliveryError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'MailDeliveryError';
  }
}

/**
 * Email transaccional con Resend (ADR 0035): un POST a su API, sin dependencias. El remitente
 * (`MAIL_FROM`) tiene que ser de un dominio verificado en Resend (SPF y DKIM).
 *
 * - Nunca escribe el contenido en los logs: los emails llevan enlaces con tokens.
 * - El error que lanza no incluye el cuerpo del email ni la respuesta completa del proveedor.
 * - Tiempo límite de 10 s para no dejar colgado el pedido que lo dispara.
 */
export class ResendMailProvider implements MailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async send(message: MailMessage): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchFn(RESEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new MailDeliveryError('El proveedor de email no respondió.', null);
    }
    if (!response.ok) {
      // Solo el nombre del error de Resend (p. ej. "validation_error"), nunca el detalle.
      const name = await response
        .json()
        .then((body: { name?: unknown }) => (typeof body.name === 'string' ? body.name : null))
        .catch(() => null);
      throw new MailDeliveryError(
        `El proveedor de email rechazó el envío (${response.status}${name ? `, ${name}` : ''}).`,
        response.status,
      );
    }
  }
}

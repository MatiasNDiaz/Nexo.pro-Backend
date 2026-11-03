import type { PushMessage, PushOutcome, PushProvider, PushTarget } from './push-provider';

/**
 * Push simulado, SOLO para desarrollo y tests (la validación del entorno lo prohíbe en
 * producción). Guarda lo que se habría mandado y permite simular respuestas del servicio de push.
 */
export class FakePushProvider implements PushProvider {
  /** Una clave pública con el formato real (65 bytes en base64url). */
  readonly publicKey = Buffer.alloc(65, 4).toString('base64url');
  readonly sent: Array<{ endpoint: string; message: PushMessage }> = [];
  private readonly outcomes = new Map<string, PushOutcome>();

  send(target: PushTarget, message: PushMessage): Promise<PushOutcome> {
    const outcome = this.outcomes.get(target.endpoint) ?? 'SENT';
    if (outcome === 'SENT') this.sent.push({ endpoint: target.endpoint, message });
    return Promise.resolve(outcome);
  }

  /** Lo que responderá el servicio de push para ese endpoint (por defecto, SENT). */
  respondWith(endpoint: string, outcome: PushOutcome): void {
    this.outcomes.set(endpoint, outcome);
  }

  /** Avisos enviados a ese endpoint, ya decodificados. */
  sentTo(endpoint: string): Array<Record<string, unknown>> {
    return this.sent
      .filter((s) => s.endpoint === endpoint)
      .map((s) => JSON.parse(s.message.payload) as Record<string, unknown>);
  }
}

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  type IdentityVerificationProvider,
  InvalidWebhookSignatureError,
  type ProviderDecision,
  type ProviderOutcome,
  type ProviderSession,
  type ProviderWebhookNotice,
  type WebhookRequest,
} from './identity-verification.provider';

export const FAKE_SIGNATURE_HEADER = 'x-fake-identity-signature';

/**
 * Proveedor simulado SOLO para desarrollo y tests. Imita un KYC real: crea sesiones, firma webhooks
 * con HMAC-SHA256 y responde decisiones al consultarlo. La validación del entorno lo prohíbe en
 * producción.
 */
export class FakeIdentityProvider implements IdentityVerificationProvider {
  readonly name = 'FAKE';
  readonly manualOnly = false;
  private readonly decisions = new Map<string, ProviderDecision>();

  constructor(private readonly webhookSecret: string) {
    if (webhookSecret.length < 32) {
      throw new Error('FAKE_IDENTITY_WEBHOOK_SECRET debe tener al menos 32 caracteres');
    }
  }

  createSession(): Promise<ProviderSession> {
    const providerReference = `fake_${randomUUID()}`;
    this.decisions.set(providerReference, { outcome: 'PENDING', reasonCode: null });
    return Promise.resolve({
      providerReference,
      redirectUrl: `https://fake-identity.local/sessions/${providerReference}`,
      clientToken: null,
    });
  }

  parseWebhook({ headers, rawBody }: WebhookRequest): Promise<ProviderWebhookNotice> {
    const received = headers[FAKE_SIGNATURE_HEADER];
    if (typeof received !== 'string' || !this.isValidSignature(rawBody, received)) {
      return Promise.reject(new InvalidWebhookSignatureError());
    }
    let body: Partial<ProviderWebhookNotice>;
    try {
      body = JSON.parse(rawBody.toString('utf8')) as Partial<ProviderWebhookNotice>;
    } catch {
      return Promise.reject(new InvalidWebhookSignatureError());
    }
    if (typeof body.eventId !== 'string' || typeof body.providerReference !== 'string') {
      return Promise.reject(new InvalidWebhookSignatureError());
    }
    return Promise.resolve({ eventId: body.eventId, providerReference: body.providerReference });
  }

  fetchDecision(providerReference: string): Promise<ProviderDecision> {
    return Promise.resolve(
      this.decisions.get(providerReference) ?? { outcome: 'PENDING', reasonCode: null },
    );
  }

  // ---- Utilidades para simular el proveedor en desarrollo y tests ----

  /** Simula que el proveedor terminó de analizar la sesión. */
  simulateDecision(
    providerReference: string,
    outcome: ProviderOutcome,
    reasonCode: string | null = null,
  ): void {
    this.decisions.set(providerReference, { outcome, reasonCode });
  }

  /** Construye un webhook firmado como lo mandaría el proveedor. */
  buildSignedWebhook(notice: ProviderWebhookNotice): WebhookRequest {
    const rawBody = Buffer.from(JSON.stringify(notice), 'utf8');
    return { rawBody, headers: { [FAKE_SIGNATURE_HEADER]: this.sign(rawBody) } };
  }

  private sign(rawBody: Buffer): string {
    return createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
  }

  private isValidSignature(rawBody: Buffer, received: string): boolean {
    const expected = Buffer.from(this.sign(rawBody), 'hex');
    const actual = Buffer.from(received, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}

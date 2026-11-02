import { Injectable } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import {
  IdentityVerificationProvider,
  InvalidWebhookSignatureError,
  ProviderDecision,
  ProviderOutcome,
  ProviderSession,
  ProviderWebhookNotice,
  WebhookRequest,
} from './identity-verification.provider';

export const FAKE_SIGNATURE_HEADER = 'x-fake-identity-signature';

/**
 * Proveedor simulado SOLO para desarrollo y tests. Imita el comportamiento de un KYC real:
 * crea sesiones, firma webhooks con HMAC-SHA256 y responde decisiones al consultarlo.
 * El módulo se niega a usarlo con NODE_ENV=production.
 */
@Injectable()
export class FakeIdentityProvider implements IdentityVerificationProvider {
  readonly name = 'FAKE';
  readonly manualOnly = false;
  private readonly decisions = new Map<string, ProviderDecision>();

  constructor(private readonly webhookSecret: string) {
    if (webhookSecret.length < 32) {
      throw new Error('FAKE_IDENTITY_WEBHOOK_SECRET debe tener al menos 32 caracteres');
    }
  }

  async createSession(): Promise<ProviderSession> {
    const providerReference = `fake_${randomUUID()}`;
    this.decisions.set(providerReference, { outcome: 'PENDING', reasonCode: null });
    return {
      providerReference,
      redirectUrl: `https://fake-identity.local/sessions/${providerReference}`,
      clientToken: null,
    };
  }

  async parseWebhook({ headers, rawBody }: WebhookRequest): Promise<ProviderWebhookNotice> {
    const received = headers[FAKE_SIGNATURE_HEADER];
    if (typeof received !== 'string' || !this.isValidSignature(rawBody, received)) {
      throw new InvalidWebhookSignatureError();
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new InvalidWebhookSignatureError();
    }
    const body = parsed as Partial<ProviderWebhookNotice>;
    if (typeof body.eventId !== 'string' || typeof body.providerReference !== 'string') {
      throw new InvalidWebhookSignatureError();
    }
    return { eventId: body.eventId, providerReference: body.providerReference };
  }

  async fetchDecision(providerReference: string): Promise<ProviderDecision> {
    return this.decisions.get(providerReference) ?? { outcome: 'PENDING', reasonCode: null };
  }

  // ---- Utilidades para simular el proveedor en dev/tests ----

  /** Simula que el proveedor terminó de analizar la sesión. */
  simulateDecision(providerReference: string, outcome: ProviderOutcome, reasonCode: string | null = null): void {
    this.decisions.set(providerReference, { outcome, reasonCode });
  }

  /** Construye un webhook firmado como lo enviaría el proveedor. */
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

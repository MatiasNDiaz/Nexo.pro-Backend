import {
  type IdentityVerificationProvider,
  type ProviderDecision,
  type ProviderSession,
  type ProviderWebhookNotice,
  WebhooksNotSupportedError,
} from './identity-verification.provider';

/**
 * Modo provisorio aprobado por el fundador mientras no haya proveedor contratado (ADR 0003).
 *
 * El usuario solicita la verificación y el admin la decide desde el panel tras validar la identidad
 * por un medio externo (por ejemplo, videollamada). No se suben ni almacenan imágenes de DNI ni selfies.
 */
export class ManualIdentityProvider implements IdentityVerificationProvider {
  readonly name = 'MANUAL';
  readonly manualOnly = true;

  createSession(): Promise<ProviderSession> {
    return Promise.resolve({ providerReference: null, redirectUrl: null, clientToken: null });
  }

  parseWebhook(): Promise<ProviderWebhookNotice> {
    return Promise.reject(new WebhooksNotSupportedError(this.name));
  }

  fetchDecision(): Promise<ProviderDecision> {
    return Promise.resolve({ outcome: 'PENDING', reasonCode: null });
  }
}

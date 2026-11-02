import { Injectable } from '@nestjs/common';
import {
  IdentityVerificationProvider,
  ProviderDecision,
  ProviderSession,
  ProviderWebhookNotice,
  WebhooksNotSupportedError,
} from './identity-verification.provider';

/**
 * Modo provisorio aprobado por el fundador mientras no haya proveedor contratado.
 *
 * El usuario solicita la verificación y el admin la decide desde el panel tras validar la identidad
 * por un medio externo (por ejemplo, videollamada). No se suben ni almacenan imágenes de DNI ni selfies.
 */
@Injectable()
export class ManualIdentityProvider implements IdentityVerificationProvider {
  readonly name = 'MANUAL';
  readonly manualOnly = true;

  async createSession(): Promise<ProviderSession> {
    return { providerReference: null, redirectUrl: null, clientToken: null };
  }

  async parseWebhook(): Promise<ProviderWebhookNotice> {
    throw new WebhooksNotSupportedError(this.name);
  }

  async fetchDecision(): Promise<ProviderDecision> {
    return { outcome: 'PENDING', reasonCode: null };
  }
}

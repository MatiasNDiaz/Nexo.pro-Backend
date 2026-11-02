/**
 * Contrato con cualquier proveedor de verificación de identidad (KYC).
 *
 * Reglas del contrato:
 * - Las imágenes de DNI y la selfie las captura el proveedor (SDK o página propia). Nunca pasan por
 *   este backend ni se guardan en nuestra base: solo guardamos estado + referencia (plan P-02, R-01).
 * - El webhook solo sirve como aviso. La decisión se confirma consultando al proveedor con
 *   `fetchDecision`, nunca confiando en el cuerpo del webhook.
 * - Un adaptador real se agrega implementando esta interfaz, sin tocar el servicio de negocio.
 */
export const IDENTITY_PROVIDER = Symbol('IDENTITY_PROVIDER');

export type ProviderOutcome = 'APPROVED' | 'REJECTED' | 'REQUIRES_REVIEW' | 'PENDING';

export interface CreateSessionInput {
  /** Id interno del intento; el proveedor lo devuelve como referencia externa si lo admite. */
  verificationId: string;
  userId: string;
}

export interface ProviderSession {
  /** Id de la sesión en el proveedor. `null` en modo manual. */
  providerReference: string | null;
  /** URL a la que el frontend redirige al usuario (flujo hospedado), si existe. */
  redirectUrl: string | null;
  /** Token de corta vida para inicializar el SDK del proveedor en el frontend, si existe. */
  clientToken: string | null;
}

export interface ProviderWebhookNotice {
  /** Id único del evento en el proveedor: base de la idempotencia. */
  eventId: string;
  providerReference: string;
}

export interface ProviderDecision {
  outcome: ProviderOutcome;
  /** Código de motivo del proveedor (sin datos personales). */
  reasonCode: string | null;
}

export interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
}

export class InvalidWebhookSignatureError extends Error {
  constructor() {
    super('Firma de webhook inválida');
    this.name = 'InvalidWebhookSignatureError';
  }
}

export class WebhooksNotSupportedError extends Error {
  constructor(provider: string) {
    super(`El proveedor ${provider} no recibe webhooks`);
    this.name = 'WebhooksNotSupportedError';
  }
}

export interface IdentityVerificationProvider {
  /** Nombre persistido en `identity_verifications.provider` (MANUAL, FAKE, VU, VERIFF, ...). */
  readonly name: string;
  /** Si es true, la decisión siempre la toma el admin (no hay decisión automática). */
  readonly manualOnly: boolean;

  createSession(input: CreateSessionInput): Promise<ProviderSession>;

  /** Verifica la firma y extrae el aviso. Lanza InvalidWebhookSignatureError si no es auténtico. */
  parseWebhook(request: WebhookRequest): Promise<ProviderWebhookNotice>;

  /** Consulta al proveedor el resultado real de una sesión. */
  fetchDecision(providerReference: string): Promise<ProviderDecision>;
}

/**
 * Contrato con el proveedor de login externo (ADR 0015). Hoy solo Google. El adaptador real usa
 * OpenID Connect (`openid-client`): authorization code con PKCE, `state` y `nonce`, y valida el ID
 * token (firma, emisor, audiencia, vencimiento y nonce). Los servicios solo ven `OAuthProfile`.
 */
export const OAUTH_PROVIDER = Symbol('OAUTH_PROVIDER');

export interface AuthorizationRequest {
  state: string;
  nonce: string;
  /** `code_challenge` S256 del verificador PKCE. */
  codeChallenge: string;
}

export interface CodeExchange {
  /** URL completa del callback tal como llegó (con `code` y `state`), armada con la URL pública. */
  callbackUrl: URL;
  expectedState: string;
  expectedNonce: string;
  codeVerifier: string;
}

export interface OAuthProfile {
  /** `sub`: identificador estable de la persona en el proveedor. */
  subject: string;
  email: string;
  /** Solo se aceptan emails verificados por el proveedor. */
  emailVerified: boolean;
  givenName: string | null;
  familyName: string | null;
}

/** El proveedor rechazó o no se pudo validar la respuesta (código inválido, state, firma...). */
export class OAuthExchangeError extends Error {
  constructor(message = 'No se pudo validar la respuesta del proveedor') {
    super(message);
    this.name = 'OAuthExchangeError';
  }
}

export interface OAuthProvider {
  authorizationUrl(request: AuthorizationRequest): Promise<URL>;
  exchange(input: CodeExchange): Promise<OAuthProfile>;
}

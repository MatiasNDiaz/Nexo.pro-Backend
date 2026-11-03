import { createHash, randomBytes } from 'node:crypto';
import {
  type AuthorizationRequest,
  type CodeExchange,
  OAuthExchangeError,
  type OAuthProfile,
  type OAuthProvider,
} from './oauth-provider';

interface PendingAuthorization {
  state: string;
  nonce: string;
  codeChallenge: string;
}

/**
 * Google simulado, SOLO para desarrollo y tests (la validación del entorno lo prohíbe en producción).
 * Imita lo que valida el adaptador real: el código es de un solo uso y exige el `state` y el
 * verificador PKCE correctos. `authorize` hace de "pantalla de Google".
 */
export class FakeOAuthProvider implements OAuthProvider {
  private readonly requests = new Map<string, PendingAuthorization>();
  private readonly codes = new Map<
    string,
    { request: PendingAuthorization; profile: OAuthProfile }
  >();

  constructor(private readonly callbackUrl: string) {}

  authorizationUrl(request: AuthorizationRequest): Promise<URL> {
    this.requests.set(request.state, request);
    const url = new URL('https://fake-google.local/authorize');
    url.searchParams.set('state', request.state);
    url.searchParams.set('redirect_uri', this.callbackUrl);
    return Promise.resolve(url);
  }

  /** Simula que la persona eligió esa cuenta de Google: devuelve la URL del callback con el código. */
  authorize(authorizationUrl: string, profile: OAuthProfile): URL {
    const state = new URL(authorizationUrl).searchParams.get('state') ?? '';
    const request = this.requests.get(state);
    if (!request) throw new Error('Pedido de autorización desconocido');
    this.requests.delete(state);
    const code = randomBytes(16).toString('base64url');
    this.codes.set(code, { request, profile });
    const callback = new URL(this.callbackUrl);
    callback.searchParams.set('code', code);
    callback.searchParams.set('state', state);
    return callback;
  }

  exchange(input: CodeExchange): Promise<OAuthProfile> {
    const code = input.callbackUrl.searchParams.get('code') ?? '';
    const entry = this.codes.get(code);
    this.codes.delete(code);
    const challenge = createHash('sha256').update(input.codeVerifier).digest('base64url');
    if (
      !entry ||
      input.callbackUrl.searchParams.get('state') !== input.expectedState ||
      entry.request.state !== input.expectedState ||
      entry.request.nonce !== input.expectedNonce ||
      entry.request.codeChallenge !== challenge
    ) {
      return Promise.reject(new OAuthExchangeError());
    }
    return Promise.resolve(entry.profile);
  }
}

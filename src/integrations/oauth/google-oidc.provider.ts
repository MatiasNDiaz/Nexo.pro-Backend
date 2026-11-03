import * as oidc from 'openid-client';
import {
  type AuthorizationRequest,
  type CodeExchange,
  OAuthExchangeError,
  type OAuthProfile,
  type OAuthProvider,
} from './oauth-provider';

const GOOGLE_ISSUER = new URL('https://accounts.google.com');

interface GoogleClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
}

/**
 * Google con OpenID Connect. La configuración (endpoints y claves de firma) se descubre una vez y se
 * reutiliza; `openid-client` valida el ID token y el PKCE.
 */
export class GoogleOidcProvider implements OAuthProvider {
  private configuration: Promise<oidc.Configuration> | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly callbackUrl: string,
  ) {}

  async authorizationUrl(request: AuthorizationRequest): Promise<URL> {
    return oidc.buildAuthorizationUrl(await this.config(), {
      redirect_uri: this.callbackUrl,
      scope: 'openid email profile',
      code_challenge: request.codeChallenge,
      code_challenge_method: 'S256',
      state: request.state,
      nonce: request.nonce,
      prompt: 'select_account',
    });
  }

  async exchange(input: CodeExchange): Promise<OAuthProfile> {
    let claims: GoogleClaims | undefined;
    try {
      const tokens = await oidc.authorizationCodeGrant(await this.config(), input.callbackUrl, {
        pkceCodeVerifier: input.codeVerifier,
        expectedState: input.expectedState,
        expectedNonce: input.expectedNonce,
        idTokenExpected: true,
      });
      claims = tokens.claims();
    } catch {
      throw new OAuthExchangeError();
    }
    if (!claims?.sub || !claims.email) throw new OAuthExchangeError('Falta el email de Google');
    return {
      subject: claims.sub,
      email: claims.email.toLowerCase(),
      emailVerified: claims.email_verified === true,
      givenName: claims.given_name ?? null,
      familyName: claims.family_name ?? null,
    };
  }

  private config(): Promise<oidc.Configuration> {
    this.configuration ??= oidc
      .discovery(GOOGLE_ISSUER, this.clientId, this.clientSecret)
      .catch((error: unknown) => {
        // Si Google no respondió, se reintenta en el próximo login.
        this.configuration = null;
        throw error;
      });
    return this.configuration;
  }
}

import { createHash } from 'node:crypto';
import { FakeOAuthProvider } from './fake-oauth.provider';
import { GoogleOidcProvider } from './google-oidc.provider';
import { OAuthExchangeError } from './oauth-provider';
import { createOAuthProvider } from './oauth-provider.module';

const CALLBACK = 'http://localhost:3001/api/v1/auth/google/callback';
const profile = {
  subject: 'sub-1',
  email: 'ana@example.com',
  emailVerified: true,
  givenName: 'Ana',
  familyName: 'Pérez',
};

describe('proveedor de login con Google', () => {
  const verifier = 'v'.repeat(43);
  const request = {
    state: 'state-1',
    nonce: 'nonce-1',
    codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
  };

  it('fake: exige state, nonce y verificador PKCE correctos, y el código sirve una vez', async () => {
    const provider = new FakeOAuthProvider(CALLBACK);
    const authorize = async () =>
      provider.authorize((await provider.authorizationUrl(request)).toString(), profile);
    const exchange = (callbackUrl: URL, overrides = {}) =>
      provider.exchange({
        callbackUrl,
        expectedState: 'state-1',
        expectedNonce: 'nonce-1',
        codeVerifier: verifier,
        ...overrides,
      });

    const callback = await authorize();
    await expect(exchange(callback)).resolves.toEqual(profile);
    await expect(exchange(callback)).rejects.toBeInstanceOf(OAuthExchangeError);

    await expect(
      exchange(await authorize(), { codeVerifier: 'x'.repeat(43) }),
    ).rejects.toBeInstanceOf(OAuthExchangeError);
    await expect(exchange(await authorize(), { expectedNonce: 'otro' })).rejects.toBeInstanceOf(
      OAuthExchangeError,
    );
  });

  it('factory: apagado, simulado o Google real según la configuración', () => {
    const base = { clientId: 'id', clientSecret: 'secret', callbackUrl: CALLBACK };
    expect(createOAuthProvider({ ...base, provider: 'disabled' })).toBeNull();
    expect(createOAuthProvider({ ...base, provider: 'fake' })).toBeInstanceOf(FakeOAuthProvider);
    expect(createOAuthProvider({ ...base, provider: 'google' })).toBeInstanceOf(GoogleOidcProvider);
  });
});

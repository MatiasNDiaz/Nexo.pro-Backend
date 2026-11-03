import { Module } from '@nestjs/common';
import { type GoogleConfig, googleConfig } from '../../config/google.config';
import { FakeOAuthProvider } from './fake-oauth.provider';
import { GoogleOidcProvider } from './google-oidc.provider';
import { OAUTH_PROVIDER, type OAuthProvider } from './oauth-provider';

/** `null` con GOOGLE_PROVIDER=disabled: las rutas de Google responden 404. */
export function createOAuthProvider(config: GoogleConfig): OAuthProvider | null {
  switch (config.provider) {
    case 'disabled':
      return null;
    case 'fake':
      return new FakeOAuthProvider(config.callbackUrl);
    case 'google':
      return new GoogleOidcProvider(config.clientId, config.clientSecret, config.callbackUrl);
  }
}

@Module({
  providers: [
    { provide: OAUTH_PROVIDER, inject: [googleConfig.KEY], useFactory: createOAuthProvider },
  ],
  exports: [OAUTH_PROVIDER],
})
export class OAuthProviderModule {}

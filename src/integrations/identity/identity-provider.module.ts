import { Module } from '@nestjs/common';
import { type IdentityConfig, identityConfig } from '../../config/storage.config';
import { FakeIdentityProvider } from './fake-identity.provider';
import {
  IDENTITY_PROVIDER,
  type IdentityVerificationProvider,
} from './identity-verification.provider';
import { ManualIdentityProvider } from './manual-identity.provider';

/**
 * Elige el adaptador según IDENTITY_PROVIDER. La validación del entorno ya prohíbe `fake` en
 * producción y exige su secreto; un proveedor real se agrega como un caso más.
 */
export function createIdentityProvider(config: IdentityConfig): IdentityVerificationProvider {
  switch (config.provider) {
    case 'manual':
      return new ManualIdentityProvider();
    case 'fake':
      return new FakeIdentityProvider(config.fakeWebhookSecret);
  }
}

@Module({
  providers: [
    {
      provide: IDENTITY_PROVIDER,
      inject: [identityConfig.KEY],
      useFactory: createIdentityProvider,
    },
  ],
  exports: [IDENTITY_PROVIDER],
})
export class IdentityProviderModule {}

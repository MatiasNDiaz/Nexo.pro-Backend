import { Module } from '@nestjs/common';
import { FakeIdentityProvider } from './fake-identity.provider';
import { IDENTITY_PROVIDER, IdentityVerificationProvider } from './identity-verification.provider';
import { ManualIdentityProvider } from './manual-identity.provider';

/**
 * Elige el adaptador según IDENTITY_PROVIDER (manual | fake | <proveedor real>).
 * En el proyecto completo esto debería leer el ConfigService tipado; acá se usa process.env
 * para que el módulo sea autocontenido. Ver README de integración.
 */
export function createIdentityProvider(env: NodeJS.ProcessEnv = process.env): IdentityVerificationProvider {
  const choice = (env.IDENTITY_PROVIDER ?? 'manual').toLowerCase();
  switch (choice) {
    case 'manual':
      return new ManualIdentityProvider();
    case 'fake':
      if (env.NODE_ENV === 'production') {
        throw new Error('IDENTITY_PROVIDER=fake no está permitido en producción');
      }
      return new FakeIdentityProvider(env.FAKE_IDENTITY_WEBHOOK_SECRET ?? '');
    default:
      throw new Error(`IDENTITY_PROVIDER desconocido: ${choice}`);
  }
}

@Module({
  providers: [{ provide: IDENTITY_PROVIDER, useFactory: () => createIdentityProvider() }],
  exports: [IDENTITY_PROVIDER],
})
export class IdentityProviderModule {}

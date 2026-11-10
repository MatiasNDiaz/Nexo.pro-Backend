import { Module } from '@nestjs/common';
import { type AppConfig, appConfig } from '../../config/app.config';
import { type StorageConfig, storageConfig } from '../../config/storage.config';
import { StorageProviderCode } from '../../uploads/file.enums';
import { CloudinaryStorageProvider } from './cloudinary-storage.provider';
import { LocalStorageProvider } from './local-storage.provider';
import {
  STORAGE_PROVIDER,
  STORAGE_REGISTRY,
  type StorageProvider,
  type StorageRegistry,
} from './storage.provider';

export function createStorageProvider(storage: StorageConfig, app: AppConfig): StorageProvider {
  switch (storage.provider) {
    case 'local':
      return new LocalStorageProvider(storage.localDir, `/${app.apiPrefix}/v1`);
    case 'cloudinary':
      return new CloudinaryStorageProvider(storage.cloudinary);
  }
}

/**
 * El activo más los otros que este ambiente puede atender (ADR 0036):
 * - disco, fuera de producción (los archivos de desarrollo que ya están en `.uploads`);
 * - Cloudinary, si hay credenciales (los que se subieron allá, aunque hoy el activo sea el disco).
 */
export function createStorageRegistry(storage: StorageConfig, app: AppConfig): StorageRegistry {
  const active = createStorageProvider(storage, app);
  const providers = new Map<StorageProviderCode, StorageProvider>([[active.code, active]]);
  if (!providers.has(StorageProviderCode.LOCAL) && !app.isProduction) {
    providers.set(
      StorageProviderCode.LOCAL,
      new LocalStorageProvider(storage.localDir, `/${app.apiPrefix}/v1`),
    );
  }
  const { cloudName, apiKey, apiSecret } = storage.cloudinary;
  if (!providers.has(StorageProviderCode.CLOUDINARY) && cloudName && apiKey && apiSecret) {
    providers.set(
      StorageProviderCode.CLOUDINARY,
      new CloudinaryStorageProvider(storage.cloudinary),
    );
  }
  return { active, for: (code) => providers.get(code) ?? null };
}

@Module({
  providers: [
    {
      provide: STORAGE_REGISTRY,
      inject: [storageConfig.KEY, appConfig.KEY],
      useFactory: createStorageRegistry,
    },
    // El activo, para quien solo sube archivos nuevos.
    {
      provide: STORAGE_PROVIDER,
      inject: [STORAGE_REGISTRY],
      useFactory: (registry: StorageRegistry) => registry.active,
    },
  ],
  exports: [STORAGE_PROVIDER, STORAGE_REGISTRY],
})
export class StorageModule {}

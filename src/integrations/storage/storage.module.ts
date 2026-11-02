import { Module } from '@nestjs/common';
import { type AppConfig, appConfig } from '../../config/app.config';
import { type StorageConfig, storageConfig } from '../../config/storage.config';
import { CloudinaryStorageProvider } from './cloudinary-storage.provider';
import { LocalStorageProvider } from './local-storage.provider';
import { STORAGE_PROVIDER, type StorageProvider } from './storage.provider';

export function createStorageProvider(storage: StorageConfig, app: AppConfig): StorageProvider {
  switch (storage.provider) {
    case 'local':
      return new LocalStorageProvider(storage.localDir, `/${app.apiPrefix}/v1`);
    case 'cloudinary':
      return new CloudinaryStorageProvider(storage.cloudinary);
  }
}

@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [storageConfig.KEY, appConfig.KEY],
      useFactory: createStorageProvider,
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}

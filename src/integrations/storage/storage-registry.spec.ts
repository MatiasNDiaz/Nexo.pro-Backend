import type { AppConfig } from '../../config/app.config';
import type { StorageConfig } from '../../config/storage.config';
import { StorageProviderCode } from '../../uploads/file.enums';
import { CloudinaryStorageProvider } from './cloudinary-storage.provider';
import { LocalStorageProvider } from './local-storage.provider';
import { createStorageRegistry } from './storage.module';

const app = (isProduction: boolean) => ({ apiPrefix: 'api', isProduction }) as unknown as AppConfig;
const credentials = {
  cloudName: 'nube',
  apiKey: '123',
  apiSecret: 'secreto',
  folder: 'repara-ya/dev',
};
const storage = (provider: 'local' | 'cloudinary', withCredentials = true): StorageConfig => ({
  provider,
  localDir: '.uploads-test',
  cloudinary: withCredentials
    ? credentials
    : { cloudName: '', apiKey: '', apiSecret: '', folder: 'repara-ya/dev' },
});

describe('registro de proveedores de archivos (ADR 0036)', () => {
  it('desarrollo con Cloudinary: lo nuevo va a Cloudinary y lo viejo de disco se sigue sirviendo', () => {
    const registry = createStorageRegistry(storage('cloudinary'), app(false));
    expect(registry.active).toBeInstanceOf(CloudinaryStorageProvider);
    expect(registry.for(StorageProviderCode.CLOUDINARY)).toBe(registry.active);
    expect(registry.for(StorageProviderCode.LOCAL)).toBeInstanceOf(LocalStorageProvider);
  });

  it('producción: sin disco (un archivo de disco no se sirve)', () => {
    const registry = createStorageRegistry(storage('cloudinary'), app(true));
    expect(registry.for(StorageProviderCode.LOCAL)).toBeNull();
  });

  it('desarrollo con disco: Cloudinary solo si tiene credenciales', () => {
    const withKeys = createStorageRegistry(storage('local'), app(false));
    expect(withKeys.active).toBeInstanceOf(LocalStorageProvider);
    expect(withKeys.for(StorageProviderCode.CLOUDINARY)).toBeInstanceOf(CloudinaryStorageProvider);
    const withoutKeys = createStorageRegistry(storage('local', false), app(false));
    expect(withoutKeys.for(StorageProviderCode.CLOUDINARY)).toBeNull();
  });

  it('los archivos nuevos de Cloudinary van dentro de la carpeta del ambiente', () => {
    const registry = createStorageRegistry(storage('cloudinary'), app(false));
    expect(registry.active.storageKeyFor('avatars', 'abc')).toBe('repara-ya/dev/avatars/abc');
  });
});

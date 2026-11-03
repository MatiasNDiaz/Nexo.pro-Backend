import { v2 as cloudinary } from 'cloudinary';
import { createHash } from 'node:crypto';
import { FileKind } from '../../uploads/file.enums';
import { CloudinaryStorageProvider } from './cloudinary-storage.provider';

const credentials = {
  cloudName: 'nube-test',
  apiKey: '1234567890',
  apiSecret: 'secreto-de-prueba',
  folder: 'nexo-test',
};

describe('CloudinaryStorageProvider', () => {
  const provider = new CloudinaryStorageProvider(credentials);

  afterEach(() => jest.restoreAllMocks());

  it('firma la subida directa: public_id, formatos y sin sobrescribir', () => {
    const storageKey = provider.storageKeyFor('avatars', 'abc');
    expect(storageKey).toBe('nexo-test/avatars/abc');

    const ticket = provider.createUploadTicket({
      storageKey,
      kind: FileKind.IMAGE,
      access: 'public',
    });
    expect(ticket.method).toBe('POST');
    expect(ticket.url).toBe('https://api.cloudinary.com/v1_1/nube-test/image/upload');
    const { signature, api_key, ...signed } = ticket.fields;
    expect(api_key).toBe(credentials.apiKey);
    expect(signed).toMatchObject({
      public_id: storageKey,
      allowed_formats: 'jpg,png,webp',
      overwrite: 'false',
    });
    expect(JSON.stringify(ticket)).not.toContain(credentials.apiSecret);

    // Algoritmo documentado por Cloudinary: SHA-1 de los parámetros ordenados + el secreto.
    const toSign = Object.keys(signed)
      .sort()
      .map((key) => `${key}=${signed[key]}`)
      .join('&');
    expect(signature).toBe(
      createHash('sha1')
        .update(toSign + credentials.apiSecret)
        .digest('hex'),
    );
  });

  it('los videos van al endpoint de video con sus formatos', () => {
    const ticket = provider.createUploadTicket({
      storageKey: 'nexo-test/x/y',
      kind: FileKind.VIDEO,
      access: 'public',
    });
    expect(ticket.url).toBe('https://api.cloudinary.com/v1_1/nube-test/video/upload');
    expect(ticket.fields.allowed_formats).toBe('mp4,mov');
  });

  it('inspect usa lo que Cloudinary decodificó (formato, bytes y duración)', async () => {
    const resource = jest
      .spyOn(cloudinary.api, 'resource')
      .mockResolvedValue({ format: 'mp4', bytes: 2048, duration: 14.2 });
    await expect(provider.inspect('nexo-test/x/y', FileKind.VIDEO, 'public')).resolves.toEqual({
      mimeType: 'video/mp4',
      sizeBytes: 2048,
      durationMs: 14200,
    });
    expect(resource).toHaveBeenCalledWith('nexo-test/x/y', {
      resource_type: 'video',
      type: 'upload',
    });

    resource.mockResolvedValue({ format: 'gif', bytes: 10 });
    expect(
      (await provider.inspect('nexo-test/x/y', FileKind.IMAGE, 'public'))?.mimeType,
    ).toBeNull();
  });

  it('inspect devuelve null si el archivo no se subió y propaga otros errores', async () => {
    const resource = jest.spyOn(cloudinary.api, 'resource');
    resource.mockRejectedValue({ error: { http_code: 404, message: 'Resource not found' } });
    await expect(provider.inspect('nexo-test/x/y', FileKind.IMAGE, 'public')).resolves.toBeNull();
    resource.mockRejectedValue({ error: { http_code: 500 } });
    await expect(provider.inspect('nexo-test/x/y', FileKind.IMAGE, 'public')).rejects.toBeDefined();
  });

  it('borra con invalidación de caché y arma URLs https', async () => {
    const destroy = jest.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' });
    await provider.delete('nexo-test/x/y', FileKind.IMAGE, 'public');
    expect(destroy).toHaveBeenCalledWith('nexo-test/x/y', {
      resource_type: 'image',
      type: 'upload',
      invalidate: true,
    });
    expect(provider.publicUrl('nexo-test/x/y', FileKind.IMAGE)).toMatch(
      /^https:\/\/res\.cloudinary\.com\/nube-test\/image\/upload\/(v1\/)?nexo-test\/x\/y$/,
    );
  });

  it('los privados se suben como authenticated y se entregan con enlace firmado que vence', () => {
    const ticket = provider.createUploadTicket({
      storageKey: 'nexo-test/chat/abc',
      kind: FileKind.IMAGE,
      access: 'private',
    });
    expect(ticket.fields.type).toBe('authenticated');
    const url = new URL(
      provider.privateUrl('nexo-test/chat/abc', FileKind.IMAGE, 'image/png', 300),
    );
    expect(url.searchParams.get('type')).toBe('authenticated');
    expect(Number(url.searchParams.get('expires_at'))).toBeGreaterThan(Date.now() / 1000);
    expect(url.toString()).not.toContain(credentials.apiSecret);
  });
});

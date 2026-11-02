import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { type StorageConfig, storageConfig } from '../src/config/storage.config';
import { StoredFile } from '../src/uploads/entities/stored-file.entity';
import { MAX_PENDING_UPLOADS_PER_USER } from '../src/uploads/file-policies';
import { FileStatus } from '../src/uploads/file.enums';
import { UploadsService } from '../src/uploads/uploads.service';
import { User } from '../src/users/entities/user.entity';
import { AccountStatus } from '../src/users/user.enums';
import { Client, setStatus, signInAdmin, signInCustomer } from './utils/auth-client';
import { createTestApp } from './utils/create-test-app';
import { PNG_BYTES, uploadAvatar, uploadRaw } from './utils/uploads';

const MB = 1024 * 1024;

describe('Archivos y foto de perfil (e2e)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let storageDir: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    storageDir = app.get<StorageConfig>(storageConfig.KEY).localDir;
  });

  afterAll(async () => {
    await app.close();
  });

  const fileRow = (id: string) => dataSource.getRepository(StoredFile).findOneByOrFail({ id });
  const onDisk = async (id: string) => existsSync(join(storageDir, (await fileRow(id)).storageKey));

  it('emite un ticket local con el peso máximo y queda PENDING_UPLOAD', async () => {
    const { client } = await signInCustomer(app);
    const res = await client.post('/uploads', { purpose: 'AVATAR', kind: 'IMAGE' });
    expect(res.status).toBe(201);
    expect(res.body.file).toMatchObject({ purpose: 'AVATAR', status: 'PENDING_UPLOAD', url: null });
    expect(res.body.upload).toMatchObject({
      method: 'PUT',
      url: `/api/v1/uploads/${res.body.file.id}/content`,
      fields: {},
      maxBytes: 5 * MB,
    });
  });

  it('rechaza un tipo de archivo que el propósito no admite', async () => {
    const { client } = await signInCustomer(app);
    const res = await client.post('/uploads', { purpose: 'AVATAR', kind: 'VIDEO' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FILE_KIND');
    expect((await client.post('/uploads', { purpose: 'OTRO', kind: 'IMAGE' })).status).toBe(400);
  });

  it('no confirma lo que todavía no se subió', async () => {
    const { client } = await signInCustomer(app);
    const created = await client.post('/uploads', { purpose: 'AVATAR', kind: 'IMAGE' });
    const res = await client.post(`/uploads/${created.body.file.id}/complete`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('UPLOAD_NOT_RECEIVED');
  });

  it('confirma una imagen real, la sirve en público y es idempotente', async () => {
    const { client } = await signInCustomer(app);
    const { put, fileId } = await uploadRaw(client, PNG_BYTES);
    expect(put.status).toBe(204);

    const res = await client.post(`/uploads/${fileId}/complete`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'READY',
      mimeType: 'image/png',
      sizeBytes: PNG_BYTES.length,
      url: `/api/v1/uploads/${fileId}/content`,
    });
    expect((await client.post(`/uploads/${fileId}/complete`)).body.status).toBe('READY');

    const content = await new Client(app).agent.get(res.body.url as string);
    expect(content.status).toBe(200);
    expect(content.headers['content-type']).toBe('image/png');
    expect(content.headers['x-content-type-options']).toBe('nosniff');
    expect(content.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(Buffer.from(content.body as Buffer).equals(PNG_BYTES)).toBe(true);
  });

  it('decide por el contenido real, no por la extensión ni el Content-Type', async () => {
    const { client } = await signInCustomer(app);
    const disguised = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    const { fileId } = await uploadRaw(client, disguised, { filename: 'foto.png' });

    const res = await client.post(`/uploads/${fileId}/complete`);
    expect(res.status).toBe(415);
    expect(res.body.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect((await fileRow(fileId)).status).toBe(FileStatus.REJECTED);
    expect(await onDisk(fileId)).toBe(false);

    const again = await client.post(`/uploads/${fileId}/complete`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('FILE_NOT_PENDING');
    // Un archivo rechazado no se sirve.
    expect((await new Client(app).get(`/uploads/${fileId}/content`)).status).toBe(404);
  });

  it('corta en la subida un archivo de más de 5 MB', async () => {
    const { client } = await signInCustomer(app);
    const big = Buffer.concat([PNG_BYTES, Buffer.alloc(5 * MB)]);
    const { put, fileId } = await uploadRaw(client, big);
    expect(put.status).toBe(413);
    expect(await onDisk(fileId)).toBe(false);
  });

  it('el archivo de otro usuario responde 404', async () => {
    const owner = await signInCustomer(app);
    const other = await signInCustomer(app);
    const { fileId } = await uploadRaw(owner.client, PNG_BYTES);
    expect((await other.client.post(`/uploads/${fileId}/complete`)).status).toBe(404);
    const put = await other.client.agent
      .put(`/api/v1/uploads/${fileId}/content`)
      .set('X-CSRF-Token', other.client.csrfToken)
      .attach('file', PNG_BYTES, 'x.png');
    expect(put.status).toBe(404);
    expect((await other.client.put('/users/me/avatar', { fileId })).status).toBe(404);
  });

  it('foto de perfil: aparece en /auth/me y al reemplazarla se borra la anterior', async () => {
    const { client, id } = await signInCustomer(app);
    const first = await uploadAvatar(client);
    expect((await client.get('/auth/me')).body.avatarUrl).toBe(first.url);

    const second = await uploadAvatar(client);
    expect((await client.get('/auth/me')).body.avatarUrl).toBe(second.url);
    expect((await fileRow(first.id)).status).toBe(FileStatus.DELETED);
    expect(await onDisk(first.id)).toBe(false);
    expect((await new Client(app).get(`/uploads/${first.id}/content`)).status).toBe(404);
    const user = await dataSource.getRepository(User).findOneByOrFail({ id });
    expect(user.avatarFileId).toBe(second.id);
  });

  it('solo se usa como foto un archivo confirmado', async () => {
    const { client } = await signInCustomer(app);
    const { fileId } = await uploadRaw(client, PNG_BYTES);
    const res = await client.put('/users/me/avatar', { fileId });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('FILE_NOT_READY');
  });

  it('una cuenta pendiente de verificación puede cargar su foto; una suspendida no', async () => {
    const pending = await signInCustomer(app, AccountStatus.PENDING_VERIFICATION);
    await uploadAvatar(pending.client);

    const suspended = await signInCustomer(app);
    await setStatus(dataSource, suspended.email, AccountStatus.SUSPENDED);
    expect(
      (await suspended.client.post('/uploads', { purpose: 'AVATAR', kind: 'IMAGE' })).status,
    ).toBe(403);
  });

  it('el admin no sube archivos por esta vía', async () => {
    const { client } = await signInAdmin(app);
    expect((await client.post('/uploads', { purpose: 'AVATAR', kind: 'IMAGE' })).status).toBe(403);
  });

  it('limita las subidas sin terminar por usuario', async () => {
    const { client } = await signInCustomer(app);
    for (let i = 0; i < MAX_PENDING_UPLOADS_PER_USER; i++) {
      expect((await client.post('/uploads', { purpose: 'AVATAR', kind: 'IMAGE' })).status).toBe(
        201,
      );
    }
    const res = await client.post('/uploads', { purpose: 'AVATAR', kind: 'IMAGE' });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('TOO_MANY_PENDING_UPLOADS');
  });

  it('la limpieza descarta las subidas abandonadas y borra su binario', async () => {
    const { client } = await signInCustomer(app);
    const { fileId } = await uploadRaw(client, PNG_BYTES);
    const fresh = await uploadRaw(client, PNG_BYTES);
    await dataSource.query(
      `UPDATE stored_files SET created_at = now() - interval '25 hours' WHERE id = $1`,
      [fileId],
    );

    expect(await app.get(UploadsService).discardStalePendingUploads()).toBeGreaterThanOrEqual(1);
    expect((await fileRow(fileId)).status).toBe(FileStatus.DELETED);
    expect(await onDisk(fileId)).toBe(false);
    expect((await fileRow(fresh.fileId)).status).toBe(FileStatus.PENDING_UPLOAD);
    expect((await client.post(`/uploads/${fileId}/complete`)).status).toBe(409);
  });
});

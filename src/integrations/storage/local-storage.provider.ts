import { mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { FileKind, StorageProviderCode } from '../../uploads/file.enums';
import { detectMimeType, mp4DurationMs } from './media-inspection';
import {
  type StorageProvider,
  type StoredObjectInfo,
  type UploadTarget,
  type UploadTicket,
  UPLOAD_TICKET_TTL_MS,
} from './storage.provider';

/** Las claves las genera la API: carpeta en minúsculas + UUID. Nada que permita salir del directorio. */
const STORAGE_KEY = /^[a-z0-9-]+\/[0-9a-f-]{36}$/;
const SNIFF_BYTES = 4100;
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime']);

/**
 * Almacenamiento en disco, SOLO para desarrollo y tests (prohibido en producción por la validación
 * del entorno). Imita el flujo de Cloudinary: el navegador sube a una URL de la propia API
 * (`PUT /uploads/:id/content`) y la confirmación inspecciona el archivo guardado.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly code = StorageProviderCode.LOCAL;
  private readonly root: string;

  constructor(
    rootDir: string,
    /** Prefijo público de la API, p. ej. `/api/v1`. */
    private readonly apiBasePath: string,
  ) {
    this.root = resolve(rootDir);
  }

  storageKeyFor(folder: string, fileId: string): string {
    return `${folder}/${fileId}`;
  }

  createUploadTicket(target: UploadTarget): UploadTicket {
    return {
      method: 'PUT',
      url: `${this.contentPath(this.fileIdOf(target.storageKey))}`,
      fields: {},
      expiresAt: new Date(Date.now() + UPLOAD_TICKET_TTL_MS),
    };
  }

  async write(storageKey: string, data: Buffer): Promise<void> {
    const path = this.pathOf(storageKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async read(storageKey: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathOf(storageKey));
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async inspect(storageKey: string, kind: FileKind): Promise<StoredObjectInfo | null> {
    const path = this.pathOf(storageKey);
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
    const handle = await open(path, 'r');
    let head: Buffer;
    try {
      head = Buffer.alloc(Math.min(size, SNIFF_BYTES));
      await handle.read(head, 0, head.length, 0);
    } finally {
      await handle.close();
    }
    const mimeType = await detectMimeType(head);
    const durationMs =
      kind === FileKind.VIDEO && mimeType && VIDEO_TYPES.has(mimeType)
        ? mp4DurationMs(await readFile(path))
        : null;
    return { mimeType, sizeBytes: size, durationMs };
  }

  async delete(storageKey: string): Promise<void> {
    await rm(this.pathOf(storageKey), { force: true });
  }

  publicUrl(_storageKey: string, _kind: FileKind, fileId: string): string {
    return this.contentPath(fileId);
  }

  private contentPath(fileId: string): string {
    return `${this.apiBasePath}/uploads/${fileId}/content`;
  }

  private fileIdOf(storageKey: string): string {
    return storageKey.slice(storageKey.lastIndexOf('/') + 1);
  }

  private pathOf(storageKey: string): string {
    if (!STORAGE_KEY.test(storageKey)) throw new Error('Clave de almacenamiento inválida');
    return join(this.root, storageKey);
  }
}

function isNotFound(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'ENOENT';
}

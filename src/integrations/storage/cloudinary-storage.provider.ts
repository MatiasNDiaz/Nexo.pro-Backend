import { v2 as cloudinary } from 'cloudinary';
import { FileKind, StorageProviderCode } from '../../uploads/file.enums';
import {
  type Access,
  type StorageProvider,
  type StoredObjectInfo,
  type UploadTarget,
  type UploadTicket,
  UPLOAD_TICKET_TTL_MS,
} from './storage.provider';

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  /** Carpeta raíz del ambiente (nexo-dev, nexo-prod). */
  folder: string;
}

/** Cloudinary trata los PDF como recurso de tipo imagen. */
const RESOURCE_TYPE: Record<FileKind, 'image' | 'video'> = {
  [FileKind.IMAGE]: 'image',
  [FileKind.VIDEO]: 'video',
  [FileKind.DOCUMENT]: 'image',
};

/** Formatos que Cloudinary acepta en la subida (firmados: el navegador no los puede cambiar). */
const ALLOWED_FORMATS: Record<FileKind, string> = {
  [FileKind.IMAGE]: 'jpg,png,webp',
  [FileKind.VIDEO]: 'mp4,mov',
  [FileKind.DOCUMENT]: 'pdf',
};

/** Formato decodificado por Cloudinary → tipo MIME. Otro formato = no admitido. */
const MIME_BY_FORMAT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  pdf: 'application/pdf',
};

interface CloudinaryResource {
  bytes?: number;
  format?: string;
  duration?: number;
}

/**
 * Cloudinary (ADR 0018). El navegador sube directo con una firma que cubre el `public_id`, los
 * formatos admitidos y `overwrite=false` (el mismo ticket no sirve para pisar un archivo ya
 * validado). La API confía en lo que Cloudinary decodificó, no en lo que mandó el navegador.
 */
export class CloudinaryStorageProvider implements StorageProvider {
  readonly code = StorageProviderCode.CLOUDINARY;

  constructor(private readonly credentials: CloudinaryCredentials) {
    cloudinary.config({
      cloud_name: credentials.cloudName,
      api_key: credentials.apiKey,
      api_secret: credentials.apiSecret,
      secure: true,
    });
  }

  storageKeyFor(folder: string, fileId: string): string {
    return `${this.credentials.folder}/${folder}/${fileId}`;
  }

  createUploadTicket(target: UploadTarget): UploadTicket {
    const params = {
      public_id: target.storageKey,
      timestamp: Math.floor(Date.now() / 1000),
      allowed_formats: ALLOWED_FORMATS[target.kind],
      overwrite: 'false',
      // Los privados se suben como `authenticated`: no tienen URL pública.
      ...(target.access === 'private' && { type: 'authenticated' }),
    };
    const signature = cloudinary.utils.api_sign_request(params, this.credentials.apiSecret);
    return {
      method: 'POST',
      url: `https://api.cloudinary.com/v1_1/${this.credentials.cloudName}/${RESOURCE_TYPE[target.kind]}/upload`,
      fields: {
        ...params,
        timestamp: String(params.timestamp),
        api_key: this.credentials.apiKey,
        signature,
      },
      expiresAt: new Date(Date.now() + UPLOAD_TICKET_TTL_MS),
    };
  }

  async inspect(
    storageKey: string,
    kind: FileKind,
    access: Access,
  ): Promise<StoredObjectInfo | null> {
    let resource: CloudinaryResource;
    try {
      resource = (await cloudinary.api.resource(storageKey, {
        resource_type: RESOURCE_TYPE[kind],
        type: DELIVERY_TYPE[access],
      })) as CloudinaryResource;
    } catch (error) {
      if (httpCodeOf(error) === 404) return null;
      throw error;
    }
    return {
      mimeType: MIME_BY_FORMAT[resource.format?.toLowerCase() ?? ''] ?? null,
      sizeBytes: resource.bytes ?? 0,
      durationMs:
        kind === FileKind.VIDEO && typeof resource.duration === 'number'
          ? Math.round(resource.duration * 1000)
          : null,
    };
  }

  async delete(storageKey: string, kind: FileKind, access: Access): Promise<void> {
    await cloudinary.uploader.destroy(storageKey, {
      resource_type: RESOURCE_TYPE[kind],
      type: DELIVERY_TYPE[access],
      invalidate: true,
    });
  }

  publicUrl(storageKey: string, kind: FileKind): string {
    return cloudinary.url(storageKey, {
      resource_type: RESOURCE_TYPE[kind],
      type: 'upload',
      secure: true,
      // Sin el parámetro `_a` que agrega el SDK (datos de uso del SDK en cada URL).
      urlAnalytics: false,
    });
  }

  privateUrl(storageKey: string, kind: FileKind, mimeType: string, ttlSec: number): string {
    const format = Object.entries(MIME_BY_FORMAT).find(([, mime]) => mime === mimeType)?.[0] ?? '';
    return cloudinary.utils.private_download_url(storageKey, format, {
      resource_type: RESOURCE_TYPE[kind],
      type: 'authenticated',
      expires_at: Math.floor(Date.now() / 1000) + ttlSec,
    });
  }
}

const DELIVERY_TYPE: Record<Access, 'upload' | 'authenticated'> = {
  public: 'upload',
  private: 'authenticated',
};

/** El SDK rechaza con `{ error: { http_code } }` (o `{ http_code }` según la versión). */
function httpCodeOf(error: unknown): number | undefined {
  const value = error as { http_code?: number; error?: { http_code?: number } } | null;
  return value?.error?.http_code ?? value?.http_code;
}

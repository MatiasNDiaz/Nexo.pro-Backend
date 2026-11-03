import type { FileKind, StorageProviderCode } from '../../uploads/file.enums';

/**
 * Contrato con el almacenamiento de archivos (ADR 0018). El navegador sube el binario directo al
 * proveedor con un ticket de vida corta; después la API consulta al proveedor el tipo, el peso y la
 * duración reales (`inspect`) y recién ahí el archivo pasa a READY. Un proveedor nuevo se agrega
 * implementando esta interfaz.
 */
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

/** Privado: solo se entrega con un enlace firmado de vida corta (adjuntos del chat, ADR 0024). */
export type Access = 'public' | 'private';

export interface UploadTarget {
  storageKey: string;
  kind: FileKind;
  access: Access;
}

/** Cómo sube el navegador: `fields` va como multipart junto al archivo (campo `file`). */
export interface UploadTicket {
  method: 'POST' | 'PUT';
  url: string;
  fields: Record<string, string>;
  expiresAt: Date;
}

/** Lo que el proveedor dice que realmente se guardó. */
export interface StoredObjectInfo {
  /** Tipo real (magic bytes o formato decodificado por el proveedor); null si no se reconoce. */
  mimeType: string | null;
  sizeBytes: number;
  /** Solo videos; null si no se pudo leer. */
  durationMs: number | null;
}

export interface StorageProvider {
  readonly code: StorageProviderCode;

  /** Clave única del archivo en el proveedor (ruta o public_id). */
  storageKeyFor(folder: string, fileId: string): string;

  createUploadTicket(target: UploadTarget): UploadTicket;

  /** Null si el archivo todavía no se subió. */
  inspect(storageKey: string, kind: FileKind, access: Access): Promise<StoredObjectInfo | null>;

  /** Idempotente: borrar algo que no existe no es un error. */
  delete(storageKey: string, kind: FileKind, access: Access): Promise<void>;

  /** URL pública (solo archivos PUBLIC). */
  publicUrl(storageKey: string, kind: FileKind, fileId: string): string;

  /**
   * Enlace firmado de vida corta para un archivo privado, o null si la API tiene que entregar el
   * contenido ella misma (adaptador local).
   */
  privateUrl(storageKey: string, kind: FileKind, mimeType: string, ttlSec: number): string | null;
}

/** Vida del ticket de subida. Cloudinary acepta firmas de hasta 1 hora. */
export const UPLOAD_TICKET_TTL_MS = 30 * 60 * 1000;

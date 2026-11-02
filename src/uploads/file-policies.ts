import { FileKind, FilePurpose, FileVisibility } from './file.enums';

const MB = 1024 * 1024;

/** Tipos reales admitidos (se comparan con lo que detecta el proveedor, no con la extensión). */
export const ALLOWED_MIME_TYPES: Record<FileKind, readonly string[]> = {
  [FileKind.IMAGE]: ['image/jpeg', 'image/png', 'image/webp'],
  [FileKind.VIDEO]: ['video/mp4', 'video/quicktime'],
};

/**
 * Videos de hasta 15 segundos (ADR 0018). Se aceptan hasta 0,5 s más porque los contenedores
 * redondean la duración (un video grabado de 15 s suele medir 15,0x s).
 */
export const MAX_VIDEO_DURATION_MS = 15_500;

/** Cantidad máxima de subidas sin confirmar por usuario: frena el abuso del almacenamiento. */
export const MAX_PENDING_UPLOADS_PER_USER = 10;

/** Subidas sin confirmar después de este tiempo se descartan (job horario). */
export const PENDING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

export interface FilePolicy {
  kinds: readonly FileKind[];
  visibility: FileVisibility;
  /** Carpeta dentro del proveedor. */
  folder: string;
  maxBytes: Record<FileKind, number>;
}

/**
 * Reglas por propósito. Pesos aprobados por el fundador (ADR 0018): foto de perfil y certificados
 * 5 MB; los medios del perfil dependen del plan y llegan en la etapa 7.2.
 */
export const FILE_POLICIES: Record<FilePurpose, FilePolicy> = {
  [FilePurpose.AVATAR]: {
    kinds: [FileKind.IMAGE],
    visibility: FileVisibility.PUBLIC,
    folder: 'avatars',
    maxBytes: { [FileKind.IMAGE]: 5 * MB, [FileKind.VIDEO]: 0 },
  },
};

/** El mayor peso de cualquier política: tope del cuerpo en la subida local. */
export const MAX_UPLOAD_BYTES = Math.max(
  ...Object.values(FILE_POLICIES).flatMap((policy) => policy.kinds.map((k) => policy.maxBytes[k])),
);

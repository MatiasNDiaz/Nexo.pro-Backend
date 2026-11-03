import { UserRole } from '../users/user.enums';
import { FileKind, FilePurpose, FileVisibility } from './file.enums';

const MB = 1024 * 1024;

/** Tipos reales admitidos (se comparan con lo que detecta el proveedor, no con la extensión). */
export const ALLOWED_MIME_TYPES: Record<FileKind, readonly string[]> = {
  [FileKind.IMAGE]: ['image/jpeg', 'image/png', 'image/webp'],
  [FileKind.VIDEO]: ['video/mp4', 'video/quicktime'],
  [FileKind.DOCUMENT]: ['application/pdf'],
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

/**
 * Tope del cuerpo en la subida al adaptador local: el mayor peso de cualquier plan (video Premium).
 * El límite real del usuario se valida después, igual que con Cloudinary.
 */
export const LOCAL_UPLOAD_MAX_BYTES = 50 * MB;

/** Pesos por plan (columnas de `subscription_plans`, ADR 0018). */
export interface PlanFileLimits {
  maxImageBytes: number;
  maxVideoBytes: number;
}

export interface FilePolicy {
  kinds: readonly FileKind[];
  roles: readonly UserRole[];
  visibility: FileVisibility;
  /** Carpeta dentro del proveedor. */
  folder: string;
  /** Si es true, hace falta un plan vigente (los pesos salen del plan). */
  needsPlan: boolean;
  maxBytes(kind: FileKind, plan: PlanFileLimits | null): number;
}

/**
 * Reglas por propósito (ADR 0018 y 0020): foto de perfil y certificados hasta 5 MB; los medios del
 * perfil según el plan (imágenes 5 MB, Premium 10 MB; videos 30 MB, Premium 50 MB).
 */
export const FILE_POLICIES: Record<FilePurpose, FilePolicy> = {
  [FilePurpose.AVATAR]: {
    kinds: [FileKind.IMAGE],
    roles: [UserRole.CUSTOMER, UserRole.PROFESSIONAL],
    visibility: FileVisibility.PUBLIC,
    folder: 'avatars',
    needsPlan: false,
    maxBytes: () => 5 * MB,
  },
  [FilePurpose.PROFILE_MEDIA]: {
    kinds: [FileKind.IMAGE, FileKind.VIDEO],
    roles: [UserRole.PROFESSIONAL],
    visibility: FileVisibility.PUBLIC,
    folder: 'media',
    needsPlan: true,
    maxBytes: (kind, plan) =>
      !plan ? 0 : kind === FileKind.VIDEO ? plan.maxVideoBytes : plan.maxImageBytes,
  },
  [FilePurpose.CHAT_ATTACHMENT]: {
    kinds: [FileKind.IMAGE, FileKind.VIDEO],
    roles: [UserRole.CUSTOMER, UserRole.PROFESSIONAL],
    visibility: FileVisibility.PRIVATE,
    folder: 'chat',
    needsPlan: false,
    // Pesos de Basic (ADR 0024).
    maxBytes: (kind) => (kind === FileKind.VIDEO ? 30 * MB : 5 * MB),
  },
  [FilePurpose.FORUM_MEDIA]: {
    kinds: [FileKind.IMAGE, FileKind.VIDEO],
    roles: [UserRole.CUSTOMER, UserRole.PROFESSIONAL],
    visibility: FileVisibility.PUBLIC,
    folder: 'forum',
    // El foro exige plan a los profesionales al publicar (ADR 0028); los clientes no tienen plan.
    needsPlan: false,
    maxBytes: (kind) => (kind === FileKind.VIDEO ? 30 * MB : 5 * MB),
  },
  [FilePurpose.EVIDENCE]: {
    kinds: [FileKind.IMAGE],
    roles: [UserRole.CUSTOMER, UserRole.PROFESSIONAL],
    visibility: FileVisibility.PRIVATE,
    folder: 'evidence',
    needsPlan: false,
    maxBytes: () => 5 * MB,
  },
  [FilePurpose.CERTIFICATE]: {
    kinds: [FileKind.IMAGE, FileKind.DOCUMENT],
    roles: [UserRole.PROFESSIONAL],
    visibility: FileVisibility.PUBLIC,
    folder: 'certificates',
    needsPlan: true,
    maxBytes: () => 5 * MB,
  },
};

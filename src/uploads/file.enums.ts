/** Para qué se sube el archivo. Define tipos, peso máximo y visibilidad (`file-policies.ts`). */
export enum FilePurpose {
  AVATAR = 'AVATAR',
}

export enum FileKind {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
}

/** PUBLIC: se sirve sin sesión (foto de perfil, medios). PRIVATE: solo con permiso (certificados). */
export enum FileVisibility {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE',
}

export enum FileStatus {
  /** Ticket emitido: el navegador todavía no confirmó la subida. */
  PENDING_UPLOAD = 'PENDING_UPLOAD',
  /** Confirmado y validado (tipo real, peso y duración). */
  READY = 'READY',
  /** No pasó la validación: el binario se borró del almacenamiento. */
  REJECTED = 'REJECTED',
  /** Reemplazado o abandonado: el binario se borró (o se intentó borrar). */
  DELETED = 'DELETED',
}

/** Valor guardado en `stored_files.provider`. */
export enum StorageProviderCode {
  CLOUDINARY = 'CLOUDINARY',
  LOCAL = 'LOCAL',
}

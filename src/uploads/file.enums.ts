/** Para qué se sube el archivo. Define tipos, peso máximo y visibilidad (`file-policies.ts`). */
export enum FilePurpose {
  AVATAR = 'AVATAR',
  /** Imágenes, videos y banner del perfil profesional (pesos según el plan). */
  PROFILE_MEDIA = 'PROFILE_MEDIA',
  /** Certificados (ADR 0020): imagen o PDF. */
  CERTIFICATE = 'CERTIFICATE',
  /** Adjuntos del chat (ADR 0024): privados, solo para los dos participantes. */
  CHAT_ATTACHMENT = 'CHAT_ATTACHMENT',
  /** Fotos y video de las publicaciones del foro (ADR 0028): públicos. */
  FORUM_MEDIA = 'FORUM_MEDIA',
  /** Fotos de reportes y de soporte (ADR 0029): privadas, las ven el autor y el admin. */
  EVIDENCE = 'EVIDENCE',
}

export enum FileKind {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  /** PDF (certificados). */
  DOCUMENT = 'DOCUMENT',
}

/** PUBLIC: se sirve sin sesión (foto, medios y certificados, ADR 0020). PRIVATE: solo con permiso (adjuntos del chat). */
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

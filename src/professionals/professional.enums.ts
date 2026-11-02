export enum RateMode {
  PER_VISIT = 'PER_VISIT',
  PER_HOUR = 'PER_HOUR',
  PER_JOB = 'PER_JOB',
}

/** Estado de atención (FI §10). El que se muestra se calcula al leerlo (`attention-status.ts`). */
export enum AttentionStatus {
  AVAILABLE = 'AVAILABLE',
  WORKING = 'WORKING',
  RESTING = 'RESTING',
}

/** Profesiones y medios que exceden el plan se ocultan, no se borran (FI §6.4). */
export enum ProItemStatus {
  ACTIVE = 'ACTIVE',
  HIDDEN_BY_PLAN = 'HIDDEN_BY_PLAN',
}

export enum MediaPurpose {
  PRESENTATION = 'PRESENTATION',
  WORK = 'WORK',
  /** Video corto de presentación en el catálogo (Premium). */
  CATALOG_VIDEO = 'CATALOG_VIDEO',
  /** Video de presentación del profesional. */
  PROFILE_VIDEO = 'PROFILE_VIDEO',
  /** Banner de la página: imagen (Medium) o video (Premium). No cuenta en los límites. */
  BANNER = 'BANNER',
}

export enum MediaStatus {
  ACTIVE = 'ACTIVE',
  HIDDEN_BY_PLAN = 'HIDDEN_BY_PLAN',
  HIDDEN_BY_ADMIN = 'HIDDEN_BY_ADMIN',
}

/** ADR 0020: publicados al subirlos; el admin puede ocultarlos. */
export enum CertStatus {
  ACTIVE = 'ACTIVE',
  HIDDEN_BY_ADMIN = 'HIDDEN_BY_ADMIN',
}

export enum SocialNetwork {
  INSTAGRAM = 'INSTAGRAM',
  FACEBOOK = 'FACEBOOK',
  TIKTOK = 'TIKTOK',
  LINKEDIN = 'LINKEDIN',
  YOUTUBE = 'YOUTUBE',
  WEBSITE = 'WEBSITE',
}

export enum ExceptionType {
  DAY_OFF = 'DAY_OFF',
  HOLIDAY = 'HOLIDAY',
  VACATION = 'VACATION',
}

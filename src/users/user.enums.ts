export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  PROFESSIONAL = 'PROFESSIONAL',
  ADMIN = 'ADMIN',
}

export enum AccountStatus {
  /** Recién registrada: puede iniciar sesión y verificarse, pero no operar. */
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  ACTIVE = 'ACTIVE',
  /** Solo puede ver el motivo, apelar y cerrar sesión (ADR 0007). */
  SUSPENDED = 'SUSPENDED',
  BANNED = 'BANNED',
  /** Cuenta dada de baja: no puede iniciar sesión. */
  DEACTIVATED = 'DEACTIVATED',
}

/** Mismos estados que el módulo de referencia de verificación de identidad (ADR 0003). */
export enum VerificationStatus {
  NOT_STARTED = 'NOT_STARTED',
  PENDING = 'PENDING',
  REQUIRES_REVIEW = 'REQUIRES_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  REVOKED = 'REVOKED',
}

/** Roles que se pueden elegir al registrarse. ADMIN solo se crea por CLI. */
export const SELF_REGISTRABLE_ROLES = [UserRole.CUSTOMER, UserRole.PROFESSIONAL] as const;

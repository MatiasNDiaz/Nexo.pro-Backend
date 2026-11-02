/**
 * Estados de un intento de verificación de identidad (plan §8.2.1, FI §26).
 * `users.verification_status` replica el estado del último intento para que los guards no hagan joins.
 */
export enum VerificationStatus {
  NOT_STARTED = 'NOT_STARTED',
  PENDING = 'PENDING',
  REQUIRES_REVIEW = 'REQUIRES_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  REVOKED = 'REVOKED',
}

/** Quién tomó la decisión final de un intento. */
export enum DecisionSource {
  PROVIDER = 'PROVIDER',
  ADMIN = 'ADMIN',
}
